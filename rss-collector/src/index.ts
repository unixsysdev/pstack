interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
}

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}

function parseRSS(xmlText: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Simple RSS parser using regex
  const itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
  
  if (itemMatches) {
    for (const itemXml of itemMatches) {
      try {
        const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i);
        const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/i);
        const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/i);
        const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);
        const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/i);
        
        const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
        const link = (linkMatch?.[1] || '').trim();
        const description = (descMatch?.[1] || descMatch?.[2] || '').trim();
        const pubDate = (pubDateMatch?.[1] || '').trim();
        const guid = (guidMatch?.[1] || '').trim();
        
        if (title && link) {
          items.push({
            title: title.replace(/<[^>]+>/g, ''),
            link,
            description: description.replace(/<[^>]+>/g, ''),
            pubDate,
            guid
          });
        }
      } catch (e) {
        console.error('Error parsing RSS item:', e);
      }
    }
  }
  
  return items;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      if (url.pathname === '/health') {
        return Response.json({ 
          status: 'RSS Collector operational',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/setup-schema' && request.method === 'POST') {
        const result = await setupEnhancedSchema(env);
        return Response.json(result, { headers: corsHeaders });
      }

      if (url.pathname === '/collect' && request.method === 'POST') {
        return await collectFromAllSources(env, corsHeaders, request);
      }

      if (url.pathname === '/sources') {
        const sources = await env.DB.prepare(`
          SELECT name, rss_url, active, last_fetch_at, last_fetch_status, error_count 
          FROM rss_sources 
          ORDER BY name
        `).all();
        return Response.json({ sources: sources.results }, { headers: corsHeaders });
      }

      if (url.pathname === '/stats') {
        const [total, active, failed, recent] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources").first(),
          env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources WHERE active = 1").first(),
          env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources WHERE last_fetch_status = 'failed'").first(),
          env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE created_at > datetime('now', '-24 hours')").first()
        ]);
        
        return Response.json({
          total_sources: total?.count || 0,
          active_sources: active?.count || 0,
          failed_sources: failed?.count || 0,
          articles_today: recent?.count || 0
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/create-demo-tags' && request.method === 'POST') {
        const result = await createDemoTags(env);
        return Response.json(result, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'RSS Collector',
        endpoints: {
          'POST /collect': 'Collect articles from all active sources',
          'GET /sources': 'List RSS sources with status',
          'GET /stats': 'Get collection statistics',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('RSS Collector error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🕒 Scheduled RSS collection starting...');
    await collectFromAllSources(env, {});
    console.log('✅ Scheduled RSS collection completed');
  }
};

async function collectFromAllSources(env: Env, corsHeaders: any, request?: Request): Promise<Response> {
  try {
    console.log('📡 Starting RSS collection from all active sources...');
    
    // Get URL parameters for batching
    const url = new URL(request?.url || 'http://localhost/');
    const limit = parseInt(url.searchParams.get('limit') || '10'); // Default to 10 sources max
    const sourceLimit = parseInt(url.searchParams.get('sourceLimit') || '20'); // Max articles per source
    
    const sources = await env.DB.prepare("SELECT * FROM rss_sources WHERE active = 1 LIMIT ?")
      .bind(limit).all();
    
    if (!sources.results || sources.results.length === 0) {
      return Response.json({ 
        error: 'No active RSS sources found in database' 
      }, { status: 400, headers: corsHeaders });
    }

    let totalCollected = 0;
    let sourcesProcessed = 0;
    let sourcesSucceeded = 0;
    let sourcesFailed = 0;

    for (const source of sources.results) {
      try {
        console.log(`📡 Collecting from ${source.name}...`);
        
        const response = await fetch(source.rss_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PStack/1.0; +https://pstack.ai)'
          },
          cf: {
            timeout: 30000
          }
        });

        if (!response.ok) {
          console.error(`❌ Failed to fetch ${source.name}: ${response.status}`);
          await markSourceFailed(env, source.id, `HTTP ${response.status}: ${response.statusText}`);
          sourcesFailed++;
          continue;
        }

        const rssText = await response.text();
        const articles = parseRSS(rssText);
        
        // Limit articles per source to prevent rate limiting
        const limitedArticles = articles.slice(0, sourceLimit);
        console.log(`📄 Found ${articles.length} articles from ${source.name}, processing ${limitedArticles.length}`);

        let newArticles = 0;
        const batchSize = 5; // Process articles in small batches
        
        for (let i = 0; i < limitedArticles.length; i += batchSize) {
          const batch = limitedArticles.slice(i, i + batchSize);
          
          for (const article of batch) {
            try {
              // Check if article exists
              const existing = await env.DB.prepare(
                "SELECT id FROM articles WHERE url = ?"
              ).bind(article.link).first();

              if (!existing) {
                // Insert article
                const result = await env.DB.prepare(`
                  INSERT INTO articles (title, url, description, published_at, source_name, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).bind(
                  article.title.substring(0, 500),
                  article.link,
                  article.description.substring(0, 1000),
                  article.pubDate || new Date().toISOString(),
                  source.name,
                  new Date().toISOString()
                ).run();

                // Create extraction job (with error handling)
                try {
                  await fetch('https://queue-manager.marcelbutucea.workers.dev/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'content_extract',
                      payload: {
                        article_id: result.meta.last_row_id,
                        url: article.link,
                        source_name: source.name
                      },
                      priority: 1
                    })
                  });
                } catch (queueError) {
                  console.error(`⚠️ Failed to queue extraction job for article ${result.meta.last_row_id}:`, queueError);
                  // Continue processing other articles even if queue fails
                }

                newArticles++;
                totalCollected++;
              }
            } catch (articleError) {
              console.error(`❌ Failed to process article from ${source.name}:`, articleError);
            }
          }
          
          // Add small delay between batches to prevent rate limiting
          if (i + batchSize < limitedArticles.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Mark source as successful
        await env.DB.prepare(`
          UPDATE rss_sources SET 
            last_fetch_at = ?,
            last_fetch_status = 'success',
            last_article_count = ?,
            error_count = 0,
            last_error = NULL
          WHERE id = ?
        `).bind(
          new Date().toISOString(),
          newArticles,
          source.id
        ).run();

        sourcesSucceeded++;
        console.log(`✅ ${source.name}: ${newArticles} new articles`);

      } catch (error) {
        console.error(`❌ Failed to collect from ${source.name}:`, error);
        await markSourceFailed(env, source.id, error instanceof Error ? error.message : String(error));
        sourcesFailed++;
      }
      
      sourcesProcessed++;
      
      // Add delay between sources to prevent rate limiting
      if (sourcesProcessed < sources.results.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`✅ RSS collection completed: ${totalCollected} new articles from ${sourcesSucceeded}/${sourcesProcessed} sources`);
    
    return Response.json({
      success: true,
      message: `RSS collection completed`,
      stats: {
        sources_processed: sourcesProcessed,
        sources_succeeded: sourcesSucceeded,
        sources_failed: sourcesFailed,
        new_articles: totalCollected
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ RSS collection failed:', error);
    return Response.json({ 
      error: `RSS collection failed: ${error}` 
    }, { status: 500, headers: corsHeaders });
  }
}

async function markSourceFailed(env: Env, sourceId: number, error: string): Promise<void> {
  try {
    await env.DB.prepare(`
      UPDATE rss_sources SET 
        last_fetch_at = ?,
        last_fetch_status = 'failed',
        last_error = ?,
        error_count = COALESCE(error_count, 0) + 1
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      error.substring(0, 500),
      sourceId
    ).run();
  } catch (e) {
    console.error('Failed to mark source as failed:', e);
  }
}

async function setupEnhancedSchema(env: Env): Promise<any> {
  try {
    console.log('🔧 Setting up enhanced database schema...');
    
    const schemaCommands = [
      `CREATE TABLE IF NOT EXISTS daily_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_name TEXT NOT NULL,
        tag_description TEXT,
        article_count INTEGER DEFAULT 0,
        created_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(tag_name, created_date)
      )`,
      `CREATE TABLE IF NOT EXISTS article_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        relevance_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        UNIQUE(article_id, tag_id)
      )`,
      `CREATE TABLE IF NOT EXISTS topic_clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_name TEXT NOT NULL,
        cluster_date TEXT NOT NULL,
        similarity_threshold REAL DEFAULT 0.8,
        article_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS article_clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL,
        cluster_id INTEGER NOT NULL,
        similarity_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        UNIQUE(article_id, cluster_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_daily_tags_date ON daily_tags(created_date)`,
      `CREATE INDEX IF NOT EXISTS idx_article_tags_article ON article_tags(article_id)`,
      `CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id)`,
      `CREATE INDEX IF NOT EXISTS idx_topic_clusters_date ON topic_clusters(cluster_date)`,
      `CREATE INDEX IF NOT EXISTS idx_article_clusters_article ON article_clusters(article_id)`,
      `CREATE INDEX IF NOT EXISTS idx_article_clusters_cluster ON article_clusters(cluster_id)`
    ];
    
    const results = [];
    for (const command of schemaCommands) {
      try {
        const result = await env.DB.prepare(command).run();
        results.push({ command: command.split('(')[0], success: true });
      } catch (error) {
        console.error('Schema command failed:', error);
        results.push({ command: command.split('(')[0], success: false, error: error.message });
      }
    }
    
    console.log('✅ Enhanced schema setup completed');
    return { success: true, results };
    
  } catch (error) {
    console.error('Schema setup failed:', error);
    return { success: false, error: error.message };
  }
}

async function createDemoTags(env: Env): Promise<any> {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Creating demo tags for:', today);
    
    const demoTags = [
      { name: "Ukraine War Updates", desc: "Latest battlefield developments and strategic implications", count: 12 },
      { name: "China-Taiwan Tensions", desc: "Cross-strait military activities and diplomatic developments", count: 8 },
      { name: "Middle East Crisis", desc: "Regional conflicts and geopolitical developments", count: 15 },
      { name: "Defense Technology", desc: "Emerging military technologies and weapons systems", count: 6 },
      { name: "NATO Operations", desc: "Alliance activities and strategic initiatives", count: 9 },
      { name: "Cyber Warfare", desc: "Digital espionage and cybersecurity threats", count: 7 },
      { name: "Nuclear Developments", desc: "Arms control and strategic weapons programs", count: 4 },
      { name: "Energy Security", desc: "Critical infrastructure and resource competition", count: 11 }
    ];
    
    let created = 0;
    for (const tag of demoTags) {
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO daily_tags 
          (tag_name, tag_description, article_count, created_date, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(tag.name, tag.desc, tag.count, today, new Date().toISOString()).run();
        created++;
        console.log(`✅ Created tag: ${tag.name}`);
      } catch (e) {
        console.error(`❌ Failed to create tag ${tag.name}:`, e);
      }
    }
    
    return { success: true, tags_created: created, date: today };
  } catch (error) {
    console.error('Demo tags creation failed:', error);
    return { success: false, error: error.message };
  }
}
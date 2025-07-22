interface Env {
  DB: D1Database;
  ORCHESTRATOR_URL: string;
}

interface RSSSource {
  id: number;
  name: string;
  rss_url: string;
  main_url: string;
  category: string;
  update_frequency: string;
  geo_focus: string; // JSON string
  tags: string; // JSON string
  last_checked: string | null;
  active: number;
}

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('RSS Collector triggered at:', new Date().toISOString());
    
    // Get active RSS sources from database
    const sources = await env.DB.prepare(
      'SELECT * FROM rss_sources WHERE active = 1'
    ).all();
    
    for (const source of sources.results as RSSSource[]) {
      try {
        await processFeed(source, env);
        // Update last_checked timestamp
        await env.DB.prepare(
          'UPDATE rss_sources SET last_checked = ? WHERE id = ?'
        ).bind(new Date().toISOString(), source.id).run();
      } catch (error) {
        console.error(`Error processing feed ${source.name}:`, error);
      }
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/trigger' && request.method === 'POST') {
      // Manual trigger for testing
      const sources = await env.DB.prepare(
        'SELECT * FROM rss_sources WHERE active = 1'
      ).all();
      
      for (const source of sources.results as RSSSource[]) {
        try {
          await processFeed(source, env);
        } catch (error) {
          console.error(`Error processing feed ${source.name}:`, error);
        }
      }
      return new Response('RSS collection triggered', { status: 200 });
    }
    
    return new Response('RSS Collector Worker', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

async function processFeed(source: RSSSource, env: Env): Promise<void> {
  try {
    // Always use direct RSS fetch (no RSS2JSON)
    const response = await fetch(source.rss_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PerspectiveStack/1.0; +https://perspectivestack.com)'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${source.name}: ${response.status}`);
      return;
    }
    
    const rssText = await response.text();
    const items = parseRSSItems(rssText);
    
    console.log(`Processing ${items.length} items from ${source.name}`);
    
    for (const item of items) {
      await processItem(item, source, env);
    }
  } catch (error) {
    console.error(`Failed to process feed ${source.name}:`, error);
  }
}

function parseRSSItems(rssText: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];
    
    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const description = extractTag(itemContent, 'description');
    const pubDate = extractTag(itemContent, 'pubDate');
    const guid = extractTag(itemContent, 'guid');
    
    if (title && link) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        description: description?.trim() || '',
        pubDate: pubDate?.trim() || new Date().toISOString(),
        guid: guid?.trim()
      });
    }
  }
  
  return items;
}

function extractTag(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\s\S]*?)<\/${tagName}>`, 'i');
  const match = regex.exec(content);
  if (match) {
    return match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
  }
  return null;
}

async function processItem(item: RSSItem, source: RSSSource, env: Env): Promise<void> {
  try {
    // Check if article already exists
    const existing = await env.DB.prepare(
      'SELECT id FROM articles WHERE url = ?'
    ).bind(item.link).first();
    
    if (existing) {
      return; // Already processed
    }
    
    // Parse JSON fields from source
    const geoFocus = JSON.parse(source.geo_focus || '[]');
    const tags = JSON.parse(source.tags || '[]');
    
    // Insert new article
    const result = await env.DB.prepare(`
      INSERT INTO articles (url, title, description, published_at, source_name, category, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.link,
      item.title,
      item.description,
      new Date(item.pubDate).toISOString(),
      source.name,
      source.category,
      JSON.stringify(tags),
      new Date().toISOString()
    ).run();
    
    if (result.success && result.meta.last_row_id) {
      console.log(`New article: ${item.title} (ID: ${result.meta.last_row_id})`);
      
      // Trigger content extraction
      await fetch(env.ORCHESTRATOR_URL + '/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: result.meta.last_row_id,
          url: item.link,
          source_name: source.name
        })
      });
    }
  } catch (error) {
    console.error('Error processing item:', error);
  }
}
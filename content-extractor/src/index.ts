interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  BROWSER: any;
}

interface ExtractionRequest {
  article_id: number;
  url: string;
  source_name: string;
}

class QueueWorker {
  constructor(private env: Env) {}

  async pollJobs(): Promise<any[]> {
    try {
      console.log('🔍 Polling for content_extract jobs...');
      const response = await fetch('https://queue-manager.marcelbutucea.workers.dev/workers/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_type: 'content_extract',
          limit: 5
        })
      });

      console.log(`📡 Poll response status: ${response.status}`);
      if (!response.ok) {
        console.error('❌ Poll request failed:', response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();
      const jobs = data.jobs || [];
      console.log(`📋 Retrieved ${jobs.length} jobs from queue`);
      return jobs;
    } catch (error) {
      console.error('❌ Error polling jobs:', error);
      return [];
    }
  }

  async completeJob(jobId: string): Promise<void> {
    try {
      await fetch(`https://queue-manager.marcelbutucea.workers.dev/jobs/${jobId}/complete`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to complete job:', error);
    }
  }

  async failJob(jobId: string, error: string): Promise<void> {
    try {
      await fetch(`https://queue-manager.marcelbutucea.workers.dev/jobs/${jobId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error })
      });
    } catch (error) {
      console.error('Failed to mark job as failed:', error);
    }
  }
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
          status: 'Content Extractor operational',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/process' && request.method === 'POST') {
        // Try queue-based processing first
        const worker = new QueueWorker(env);
        const jobs = await worker.pollJobs();
        
        console.log(`🔄 Processing ${jobs.length} extraction jobs from queue`);
        
        let processed = 0;
        for (const job of jobs) {
          try {
            console.log(`🔍 Processing job ${job.id}:`, job.payload);
            await extractContent(job.payload, env);
            await worker.completeJob(job.id);
            processed++;
            console.log(`✅ Job ${job.id} completed successfully`);
          } catch (error) {
            console.error(`❌ Job ${job.id} failed:`, error);
            await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
          }
        }
        
        // If no queue jobs, process articles directly from database
        if (processed === 0) {
          console.log('📋 No queue jobs found, processing articles directly from database');
          const articles = await env.DB.prepare(`
            SELECT id, url, source_name, title, status 
            FROM articles 
            WHERE (status IS NULL OR status = '' OR status = 'pending_extraction' OR (status NOT LIKE '%extracted%' AND status NOT LIKE '%processing%' AND status NOT LIKE '%failed%'))
            AND url IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 5
          `).all();
          
          console.log(`📰 Found ${articles.results?.length || 0} articles to extract`);
          
          for (const article of (articles.results || [])) {
            try {
              console.log(`🔍 Processing article ${article.id}: ${article.title}`);
              await extractContent({
                article_id: article.id,
                url: article.url,
                source_name: article.source_name
              }, env);
              processed++;
              console.log(`✅ Article ${article.id} processed successfully`);
            } catch (error) {
              console.error(`❌ Article ${article.id} failed:`, error);
            }
          }
        }
        
        console.log(`📊 Processed ${processed} articles total`);
        
        return Response.json({ 
          success: true, 
          processed_jobs: processed,
          total_jobs: jobs.length,
          direct_processed: processed - jobs.length
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/extract' && request.method === 'POST') {
        const payload = await request.json();
        await extractContent(payload, env);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname === '/batch-extract' && request.method === 'POST') {
        const { limit = 10 } = await request.json();
        
        // Get articles that need extraction (status is NULL or 'pending')
        const articles = await env.DB.prepare(`
          SELECT id, url, source_name FROM articles 
          WHERE (status IS NULL OR status = 'pending' OR status = 'pending_extraction' OR status NOT LIKE '%extracted%')
          ORDER BY created_at ASC 
          LIMIT ?
        `).bind(limit).all();

        let jobsCreated = 0;
        for (const article of articles.results || []) {
          try {
            await fetch('https://queue-manager.marcelbutucea.workers.dev/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'content_extract',
                payload: {
                  article_id: article.id,
                  url: article.url,
                  source_name: article.source_name
                },
                priority: 1
              })
            });
            jobsCreated++;
          } catch (error) {
            console.error('Failed to create extraction job:', error);
          }
        }

        return Response.json({ 
          success: true, 
          jobs_created: jobsCreated,
          articles_found: articles.results?.length || 0 
        }, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'Content Extractor',
        endpoints: {
          'POST /process': 'Process jobs from queue',
          'POST /extract': 'Extract single article',
          'POST /batch-extract': 'Create extraction jobs for pending articles',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('Content Extractor error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🕒 Processing extraction jobs...');
    const worker = new QueueWorker(env);
    const jobs = await worker.pollJobs();
    
    for (const job of jobs) {
      try {
        await extractContent(job.payload, env);
        await worker.completeJob(job.id);
      } catch (error) {
        await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
};

async function extractContent(req: ExtractionRequest, env: Env): Promise<void> {
  try {
    console.log(`🔍 Extracting content for article ${req.article_id}: ${req.url}`);
    
    // Check if already processed
    const existing = await env.DB.prepare(
      'SELECT status FROM articles WHERE id = ?'
    ).bind(req.article_id).first();
    
    if (!existing) {
      console.error(`❌ Article ${req.article_id} not found`);
      return;
    }
    
    if (existing.status && existing.status.includes('extracted')) {
      console.log(`✅ Article ${req.article_id} already extracted (${existing.status})`);
      return;
    }

    // Update status to extracting
    await env.DB.prepare(
      'UPDATE articles SET status = ?, updated_at = ? WHERE id = ?'
    ).bind('extracting', new Date().toISOString(), req.article_id).run();
    
    let content = '';
    let title = '';
    let extractionMethod = 'fetch';
    
    try {
      console.log(`🌐 Extracting content from ${req.url}`);
      
      // Try browser rendering first for JavaScript-heavy sites
      let html = '';
      try {
        console.log(`🌐 Attempting browser rendering for ${req.url}`);
        const browser = await env.BROWSER.launch();
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(req.url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for content to load
        await page.waitForTimeout(2000);
        
        html = await page.content();
        extractionMethod = 'browser';
        
        await browser.close();
        console.log(`✅ Browser extraction successful`);
        
      } catch (browserError) {
        console.log(`⚠️ Browser rendering failed, falling back to fetch: ${browserError}`);
        
        // Fallback to regular fetch
        const response = await fetch(req.url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          cf: {
            timeout: 30000
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        html = await response.text();
        extractionMethod = 'fetch';
      }
      
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : '';
      
      // Extract content using multiple selectors
      const contentSelectors = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*story[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ];
      
      for (const selector of contentSelectors) {
        const match = html.match(selector);
        if (match && match[1]) {
          content = match[1];
          break;
        }
      }
      
      if (!content) {
        // Extract from body as last resort
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        content = bodyMatch ? bodyMatch[1].substring(0, 5000) : html.substring(0, 5000);
      }
      
      // Clean HTML
      content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log(`✅ Extraction successful: ${content.length} chars, title: "${title.substring(0, 50)}..."`);
      
    } catch (extractionError) {
      console.error(`❌ Content extraction failed:`, extractionError);
      await env.DB.prepare(
        'UPDATE articles SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?'
      ).bind(
        'extraction_failed',
        extractionError instanceof Error ? extractionError.message : String(extractionError),
        new Date().toISOString(),
        req.article_id
      ).run();
      return;
    }
    
    console.log(`🔍 Content check: length=${content?.length || 0}, threshold=100`);
    if (content && content.length > 100) {
      // Store in R2 with correct key format for downstream workers
      const contentKey = `content/article_${req.article_id}.json`;
      const contentData = {
        article_id: req.article_id,
        url: req.url,
        title: title,
        content: content,
        word_count: content.split(' ').length,
        extracted_at: new Date().toISOString(),
        source_name: req.source_name,
        extraction_method: extractionMethod
      };
      
      console.log(`💾 Saving content to R2: ${contentKey}`);
      let r2Success = false;
      try {
        const putResult = await env.CONTENT_BUCKET.put(contentKey, JSON.stringify(contentData, null, 2), {
          httpMetadata: { contentType: 'application/json' }
        });
        console.log(`✅ Content saved to R2: ${contentKey}, result:`, putResult);
        r2Success = true;
      } catch (r2Error) {
        console.error(`❌ R2 storage failed for ${contentKey}:`, r2Error);
        console.error(`❌ R2 error details:`, r2Error.message, r2Error.stack);
        // Don't throw here, let's see what happens
      }
      
      if (!r2Success) {
        console.error(`❌ Skipping database update due to R2 failure`);
        await env.DB.prepare(
          'UPDATE articles SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?'
        ).bind(
          'extraction_failed',
          'R2 storage failed',
          new Date().toISOString(),
          req.article_id
        ).run();
        return;
      }
      
      // Update DB
      await env.DB.prepare(`
        UPDATE articles SET 
          content = ?, 
          status = ?, 
          processed_at = ?, 
          extraction_error = NULL, 
          updated_at = ? 
        WHERE id = ?
      `).bind(
        content.substring(0, 1000), // Store first 1000 chars in DB
        'extracted',
        new Date().toISOString(),
        new Date().toISOString(), 
        req.article_id
      ).run();
      
      console.log(`✅ Content stored successfully: ${content.length} chars`);
      
      // Queue vectorization job
      console.log(`🚀 Queuing vectorization for article ${req.article_id}`);
      await fetch("https://queue-manager.marcelbutucea.workers.dev/jobs", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: "vectorize",
          payload: {
            article_id: req.article_id,
            content_key: contentKey
          },
          priority: 2
        })
      });
      
    } else {
      console.error(`❌ Content too short: ${content?.length || 0} chars`);
      await env.DB.prepare(
        'UPDATE articles SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?'
      ).bind(
        'extraction_failed',
        `Content too short: ${content?.length || 0} chars`,
        new Date().toISOString(),
        req.article_id
      ).run();
    }
    
  } catch (error) {
    console.error('❌ Content extraction failed:', error);
    await env.DB.prepare(
      'UPDATE articles SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?'
    ).bind(
      'extraction_exception',
      error instanceof Error ? error.message : String(error),
      new Date().toISOString(),
      req.article_id
    ).run();
  }
}
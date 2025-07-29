interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  OPENROUTER_API_KEY: string;
}

interface SummarizeRequest {
  article_id: number;
  content_key: string;
}

class QueueWorker {
  constructor(private env: Env) {}

  async pollJobs(): Promise<any[]> {
    try {
      const response = await fetch('https://queue-manager.marcelbutucea.workers.dev/workers/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_type: 'summarize',
          worker_id: 'ai-summarizer-' + Date.now(),
          limit: 2  // Process fewer at once since AI calls are expensive
        })
      });

      if (!response.ok) return [];
      const { jobs } = await response.json();
      return jobs || [];
    } catch (error) {
      console.error('Error polling jobs:', error);
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
          status: 'AI Summarizer operational - OpenRouter Gemini 2.5 Flash Lite',
          timestamp: new Date().toISOString(),
          api_key_configured: !!env.OPENROUTER_API_KEY,
          api_key_length: env.OPENROUTER_API_KEY?.length || 0
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/process' && request.method === 'POST') {
        const worker = new QueueWorker(env);
        const jobs = await worker.pollJobs();
        
        let processed = 0;
        for (const job of jobs) {
          try {
            await summarizeContent(job.payload, env);
            await worker.completeJob(job.id);
            processed++;
          } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
          }
        }
        
        // If no queue jobs, process articles directly from database
        if (processed === 0) {
          console.log('📋 No queue jobs found, processing articles directly from database');
          const articles = await env.DB.prepare(`
            SELECT id, title FROM articles 
            WHERE status = 'extracted'
            ORDER BY created_at DESC 
            LIMIT 3
          `).all();
          
          console.log(`📰 Found ${articles.results?.length || 0} extracted articles to summarize`);
          
          for (const article of (articles.results || [])) {
            try {
              console.log(`🤖 Processing article ${article.id}: ${article.title}`);
              await summarizeContent({
                article_id: article.id,
                content_key: `content/article_${article.id}.json`
              }, env);
              processed++;
              console.log(`✅ Article ${article.id} summarized successfully`);
            } catch (error) {
              console.error(`❌ Article ${article.id} failed:`, error);
            }
          }
        }

        return Response.json({ 
          success: true, 
          processed_jobs: processed,
          total_jobs: jobs.length,
          direct_processed: processed - jobs.length
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/summarize' && request.method === 'POST') {
        const payload = await request.json();
        await summarizeContent(payload, env);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname === '/test-api' && request.method === 'POST') {
        const { title, content, source } = await request.json();
        
        console.log(`🧪 Testing API with title: ${title}`);
        console.log(`🔑 API Key available: ${env.OPENROUTER_API_KEY ? 'Yes' : 'No'}`);
        const summary = await generateSummary(title, content, source, env);
        return Response.json({ 
          success: !!summary, 
          summary,
          summary_length: summary?.length || 0,
          api_key_present: !!env.OPENROUTER_API_KEY
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/test-r2' && request.method === 'POST') {
        const { content_key } = await request.json();
        try {
          console.log(`🔍 Testing R2 access for key: ${content_key}`);
          const contentObj = await env.CONTENT_BUCKET.get(content_key);
          if (!contentObj) {
            return Response.json({
              success: false,
              error: `Content not found: ${content_key}`,
              bucket_accessible: true
            }, { headers: corsHeaders });
          }
          const contentData = JSON.parse(await contentObj.text());
          return Response.json({
            success: true,
            content_length: contentData.content?.length || 0,
            title: contentData.title?.substring(0, 50) || 'No title',
            article_id: contentData.article_id
          }, { headers: corsHeaders });
        } catch (error) {
          return Response.json({
            success: false,
            error: error.message,
            bucket_accessible: false
          }, { headers: corsHeaders });
        }
      }

      if (url.pathname === '/test-raw-api' && request.method === 'POST') {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://pstack.ai',
              'X-Title': 'PStack Intelligence Platform'
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash-lite',
              messages: [{ role: 'user', content: 'Say "Hello World"' }],
              max_tokens: 50
            })
          });
          
          const result = await response.json();
          return Response.json({
            status: response.status,
            response: result,
            api_key_present: !!env.OPENROUTER_API_KEY
          }, { headers: corsHeaders });
        } catch (error) {
          return Response.json({
            error: error.message,
            api_key_present: !!env.OPENROUTER_API_KEY
          }, { headers: corsHeaders });
        }
      }

      if (url.pathname === '/stats') {
        const stats = await getSummaryStats(env);
        return Response.json(stats, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'AI Summarizer - OpenRouter Gemini 2.5 Flash Lite',
        endpoints: {
          'POST /process': 'Process summarization jobs from queue',
          'POST /summarize': 'Summarize single article',
          'GET /stats': 'Get summarization statistics',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('AI Summarizer error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🕒 Processing AI summarization jobs...');
    const worker = new QueueWorker(env);
    const jobs = await worker.pollJobs();
    
    for (const job of jobs) {
      try {
        await summarizeContent(job.payload, env);
        await worker.completeJob(job.id);
      } catch (error) {
        await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
};

async function summarizeContent(req: SummarizeRequest, env: Env): Promise<void> {
  try {
    console.log(`🤖 Summarizing article ${req.article_id} from ${req.content_key}`);
    
    // Check if already summarized
    const existingSummary = await env.DB.prepare(
      'SELECT id FROM ai_summaries WHERE article_id = ?'
    ).bind(req.article_id).first();
    
    if (existingSummary) {
      console.log(`✅ Article ${req.article_id} already summarized`);
      return;
    }

    // Update article status
    try {
      await env.DB.prepare(
        'UPDATE articles SET status = ?, updated_at = ? WHERE id = ?'
      ).bind('summarizing', new Date().toISOString(), req.article_id).run();
    } catch (error) {
      console.log(`⚠️ Database update failed (testing mode): ${error.message}`);
    }
    
    // Get content from R2
    console.log(`📄 Retrieving content from R2: ${req.content_key}`);
    const contentObj = await env.CONTENT_BUCKET.get(req.content_key);
    if (!contentObj) {
      console.error(`❌ Content not found in R2: ${req.content_key}`);
      // Let's check what objects exist in R2
      const objects = await env.CONTENT_BUCKET.list({ prefix: 'content/' });
      console.log(`🔍 Available objects in R2 content/:`, objects.objects.map(o => o.key));
      throw new Error(`Content not found: ${req.content_key}`);
    }
    console.log(`✅ Content retrieved from R2 successfully`);
    
    const contentData = JSON.parse(await contentObj.text());
    const content = contentData.content;
    
    if (!content || content.length < 100) {
      throw new Error(`Content too short: ${content?.length || 0} chars`);
    }
    
    console.log(`📝 Generating AI summary for "${contentData.title}" (${content.length} chars)`);
    
    // Generate AI summary using OpenRouter Gemini 2.5 Flash Lite
    const summary = await generateSummary(contentData.title, content, contentData.source_name, env);
    
    if (!summary) {
      throw new Error('Failed to generate summary');
    }
    
    // Store summary in database
    await env.DB.prepare(`
      INSERT INTO ai_summaries 
      (article_id, summary, created_at)
      VALUES (?, ?, ?)
    `).bind(
      req.article_id,
      summary,
      new Date().toISOString()
    ).run();
    
    // Update article status
    await env.DB.prepare(`
      UPDATE articles SET 
        status = 'summarized',
        updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), req.article_id).run();
    
    console.log(`✅ Article ${req.article_id} summarized successfully`);
    
  } catch (error) {
    console.error('❌ Summarization failed:', error);
    await env.DB.prepare(
      'UPDATE articles SET status = ?, extraction_error = ?, updated_at = ? WHERE id = ?'
    ).bind(
      'summarization_failed',
      error instanceof Error ? error.message : String(error),
      new Date().toISOString(),
      req.article_id
    ).run();
    throw error;
  }
}

async function generateSummary(title: string, content: string, sourceName: string, env: Env): Promise<string | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = `You are a world-class geopolitical intelligence analyst for PerspectiveStack.com. Analyze this article with the depth and insight of a top-tier think tank analyst.

ARTICLE DETAILS:
Title: ${title}
Source: ${sourceName}
Content: ${content.substring(0, 4000)}

PROVIDE A COMPREHENSIVE ANALYSIS WITH:

1. **EXECUTIVE SUMMARY** (2-3 sentences)
   - Core event and immediate significance

2. **KEY DEVELOPMENTS** 
   - What exactly happened, when, and where
   - Primary actors and their roles
   - Timeline of events

3. **MULTI-PERSPECTIVE ANALYSIS**
   - Western/NATO perspective
   - Russian/Chinese perspective  
   - Regional power perspective
   - Global South perspective

4. **STRATEGIC IMPLICATIONS**
   - Short-term consequences (1-6 months)
   - Long-term strategic shifts (1-5 years)
   - Impact on global power balance
   - Economic/security ramifications

5. **INTELLIGENCE ASSESSMENT**
   - Reliability of information
   - Potential disinformation elements
   - Information gaps to monitor

Write in clear, analytical prose. Be objective but insightful. This analysis will inform policy makers and strategic decision makers globally.`;

      console.log(`🚀 Attempt ${attempt}/${maxRetries}: Calling OpenRouter API with prompt length: ${prompt.length} chars`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pstack.ai',
          'X-Title': 'PStack Intelligence Platform'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                }
              ]
            }
          ],
          max_tokens: 1500,
          temperature: 0.4,
          top_p: 0.9
        })
      });

      console.log(`📡 Attempt ${attempt}: OpenRouter response status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.choices && result.choices[0] && result.choices[0].message) {
          const summary = result.choices[0].message.content.trim();
          console.log(`✅ Summary generated on attempt ${attempt} (${summary.length} chars)`);
          return summary;
        } else {
          console.error(`❌ Invalid response structure on attempt ${attempt}:`, result);
          throw new Error('Invalid response structure');
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Attempt ${attempt} failed: ${response.status} - ${errorText}`);
        
        if (attempt === maxRetries) {
          throw new Error(`All ${maxRetries} attempts failed. Last error: ${response.status} - ${errorText}`);
        }
        
        // Wait before retrying (exponential backoff)
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} error:`, error);
      
      if (attempt === maxRetries) {
        console.error('❌ All retry attempts failed:', error);
        return null;
      }
      
      // Wait before retrying
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

async function getSummaryStats(env: Env): Promise<any> {
  try {
    const [totalSummaries, totalArticles, summariesToday, articlesWithSummaries] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM ai_summaries").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM ai_summaries WHERE DATE(created_at) = DATE('now')").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%summarized%'").first()
    ]);
    
    return {
      total_summaries: totalSummaries?.count || 0,
      total_articles: totalArticles?.count || 0,
      summaries_today: summariesToday?.count || 0,
      summarized_articles: articlesWithSummaries?.count || 0,
      summary_rate: totalArticles?.count > 0 ? 
        ((totalSummaries?.count || 0) / totalArticles.count * 100).toFixed(1) + '%' : '0%'
    };
  } catch (error) {
    return { error: error.message };
  }
}
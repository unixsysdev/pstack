interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  BROWSER: Fetcher;
}

interface ExtractionRequest {
  article_id: number;
  url: string;
  source_name: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/extract' && request.method === 'POST') {
      try {
        const body: ExtractionRequest = await request.json();
        ctx.waitUntil(extractContent(body, env));
        return new Response('Content extraction initiated', { status: 200 });
      } catch (error) {
        return new Response('Extraction failed: ' + error, { status: 500 });
      }
    }
    
    return new Response('Content Extractor Worker', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

async function extractContent(req: ExtractionRequest, env: Env): Promise<void> {
  try {
    console.log(`Extracting content for article ${req.article_id}: ${req.url}`);
    
    // Use Cloudflare Browser Rendering API
    const browserResponse = await env.BROWSER.fetch("https://cloudflare.com/browser-rendering", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cmd: "session.create",
        url: req.url,
        options: {
          waitUntil: "networkidle",
          timeout: 30000
        }
      }),
    });
    
    if (!browserResponse.ok) {
      console.error('Browser rendering failed:', await browserResponse.text());
      // Fallback to simple fetch
      return await fallbackExtraction(req, env);
    }
    
    const browserResult = await browserResponse.json();
    
    if (!browserResult.success) {
      console.error('Browser rendering error:', browserResult.error);
      return await fallbackExtraction(req, env);
    }
    
    // Extract content using browser API
    const extractResponse = await env.BROWSER.fetch("https://cloudflare.com/browser-rendering", {
      method: "POST", 
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cmd: "session.evaluate",
        sessionId: browserResult.sessionId,
        expression: `
          // Remove scripts, ads, navigation
          document.querySelectorAll('script, style, nav, footer, aside, .ad, .advertisement').forEach(el => el.remove());
          
          // Extract main content
          let content = '';
          const selectors = ['article', 'main', '[role="main"]', '.content', '.post-content', '.entry-content'];
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.length > 500) {
              content = element.textContent;
              break;
            }
          }
          
          if (!content) {
            content = document.body.textContent;
          }
          
          ({
            title: document.title,
            content: content.replace(/\\s+/g, ' ').trim(),
            wordCount: content.split(' ').length,
            url: window.location.href
          })
        `
      }),
    });
    
    const extractResult = await extractResponse.json();
    
    if (extractResult.success && extractResult.result.content) {
      const content = extractResult.result.content;
      
      if (content.length > 100) {
        // Store in R2
        const contentKey = `articles/${req.article_id}.json`;
        const contentData = {
          article_id: req.article_id,
          url: req.url,
          title: extractResult.result.title,
          content: content,
          word_count: extractResult.result.wordCount,
          extracted_at: new Date().toISOString(),
          source_name: req.source_name,
          extraction_method: 'browser_rendering'
        };
        
        await env.CONTENT_BUCKET.put(contentKey, JSON.stringify(contentData, null, 2), {
          httpMetadata: { contentType: 'application/json' }
        });
        
        // Update DB
        await env.DB.prepare(`
          UPDATE articles SET content = ?, processed_at = ?, updated_at = ? WHERE id = ?
        `).bind(
          content.substring(0, 1000),
          new Date().toISOString(),
          new Date().toISOString(), 
          req.article_id
        ).run();
        
        console.log(`✅ Content extracted with browser rendering: ${content.length} chars`);
      }
    } else {
      console.error('Browser extraction failed, using fallback');
      await fallbackExtraction(req, env);
    }
    
    // Clean up browser session
    await env.BROWSER.fetch("https://cloudflare.com/browser-rendering", {
      method: "POST",
      body: JSON.stringify({
        cmd: "session.close",
        sessionId: browserResult.sessionId
      })
    });
    
  } catch (error) {
    console.error('Content extraction failed:', error);
    await fallbackExtraction(req, env);
  }
}

async function fallbackExtraction(req: ExtractionRequest, env: Env): Promise<void> {
  try {
    const response = await fetch(req.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PerspectiveStack/1.0)' }
    });
    
    if (!response.ok) return;
    
    const html = await response.text();
    const content = html.substring(1000, 6000); // Simple fallback
    
    if (content.length > 100) {
      const contentKey = `articles/${req.article_id}.json`;
      const contentData = {
        article_id: req.article_id,
        url: req.url,
        content: content,
        extracted_at: new Date().toISOString(),
        source_name: req.source_name,
        extraction_method: 'fallback'
      };
      
      await env.CONTENT_BUCKET.put(contentKey, JSON.stringify(contentData, null, 2));
      
      console.log(`✅ Fallback extraction completed: ${content.length} chars`);
    }
  } catch (error) {
    console.error('Fallback extraction failed:', error);
  }
}
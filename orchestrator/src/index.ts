interface Env {
  DB: D1Database;
  CONTENT_EXTRACTOR_URL: string;
  CONTENT_PROCESSOR_URL: string;
  VECTOR_WORKER_URL: string;
}

interface TaskRequest {
  article_id?: number;
  url?: string;
  source_name?: string;
  content_key?: string;
  analysis_key?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'POST') {
      const body: TaskRequest = await request.json();
      
      switch (url.pathname) {
        case '/extract':
          return await handleExtraction(body, env);
          
        case '/process':
          return await handleProcessing(body, env);
          
        case '/vectorize':
          return await handleVectorization(body, env);
          
        case '/status':
          return await getStatus(body, env);
          
        case '/retry':
          return await retryFailed(env);
          
        default:
          return new Response('Unknown endpoint', { status: 404 });
      }
    }
    
    if (url.pathname === '/health') {
      return new Response('Orchestrator OK', { status: 200 });
    }
    
    if (url.pathname === '/metrics') {
      return await getMetrics(env);
    }
    
    return new Response('Intelligence Pipeline Orchestrator', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

async function handleExtraction(body: TaskRequest, env: Env): Promise<Response> {
  try {
    if (!body.article_id || !body.url) {
      return new Response('Missing article_id or url', { status: 400 });
    }
    
    // Log extraction request
    await env.DB.prepare(`
      INSERT INTO processing_queue (article_id, task_type, status, created_at)
      VALUES (?, 'extract', 'processing', ?)
    `).bind(
      body.article_id,
      new Date().toISOString()
    ).run();
    
    // Forward to content extractor
    const response = await fetch(env.CONTENT_EXTRACTOR_URL + '/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      return new Response('Extraction initiated', { status: 200 });
    } else {
      await logError(body.article_id, 'extract', await response.text(), env);
      return new Response('Extraction failed', { status: 500 });
    }
  } catch (error) {
    console.error('Extraction orchestration failed:', error);
    await logError(body.article_id, 'extract', String(error), env);
    return new Response('Extraction orchestration failed', { status: 500 });
  }
}

async function handleProcessing(body: TaskRequest, env: Env): Promise<Response> {
  try {
    if (!body.article_id || !body.content_key) {
      return new Response('Missing article_id or content_key', { status: 400 });
    }
    
    // Log processing request
    await env.DB.prepare(`
      INSERT INTO processing_queue (article_id, task_type, status, created_at)
      VALUES (?, 'process', 'processing', ?)
    `).bind(
      body.article_id,
      new Date().toISOString()
    ).run();
    
    // Forward to content processor
    const response = await fetch(env.CONTENT_PROCESSOR_URL + '/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      return new Response('Processing initiated', { status: 200 });
    } else {
      await logError(body.article_id, 'process', await response.text(), env);
      return new Response('Processing failed', { status: 500 });
    }
  } catch (error) {
    console.error('Processing orchestration failed:', error);
    await logError(body.article_id, 'process', String(error), env);
    return new Response('Processing orchestration failed', { status: 500 });
  }
}

async function handleVectorization(body: TaskRequest, env: Env): Promise<Response> {
  try {
    if (!body.article_id) {
      return new Response('Missing article_id', { status: 400 });
    }
    
    // Log vectorization request
    await env.DB.prepare(`
      INSERT INTO processing_queue (article_id, task_type, status, created_at)
      VALUES (?, 'vectorize', 'processing', ?)
    `).bind(
      body.article_id,
      new Date().toISOString()
    ).run();
    
    // Forward to vector worker
    const response = await fetch(env.VECTOR_WORKER_URL + '/vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      return new Response('Vectorization initiated', { status: 200 });
    } else {
      await logError(body.article_id, 'vectorize', await response.text(), env);
      return new Response('Vectorization failed', { status: 500 });
    }
  } catch (error) {
    console.error('Vectorization orchestration failed:', error);
    await logError(body.article_id, 'vectorize', String(error), env);
    return new Response('Vectorization orchestration failed', { status: 500 });
  }
}

async function getStatus(body: TaskRequest, env: Env): Promise<Response> {
  try {
    const articleId = body.article_id;
    if (!articleId) {
      return new Response('Missing article_id', { status: 400 });
    }
    
    const tasks = await env.DB.prepare(`
      SELECT task_type, status, attempts, created_at, updated_at
      FROM processing_queue 
      WHERE article_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(articleId).all();
    
    return new Response(JSON.stringify({
      article_id: articleId,
      tasks: tasks.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return new Response('Status check failed', { status: 500 });
  }
}

async function getMetrics(env: Env): Promise<Response> {
  try {
    const metrics = await env.DB.prepare(`
      SELECT 
        task_type,
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM processing_queue 
      WHERE created_at > datetime('now', '-24 hours')
      GROUP BY task_type, status
    `).all();
    
    const articleStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_articles,
        COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_articles,
        COUNT(CASE WHEN created_at > datetime('now', '-1 hour') THEN 1 END) as recent_articles
      FROM articles
    `).first();
    
    return new Response(JSON.stringify({
      processing_metrics: metrics.results,
      article_stats: articleStats,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Metrics failed:', error);
    return new Response('Metrics failed', { status: 500 });
  }
}

async function retryFailed(env: Env): Promise<Response> {
  try {
    // Get failed tasks from last 24 hours
    const failedTasks = await env.DB.prepare(`
      SELECT DISTINCT article_id, task_type
      FROM processing_queue 
      WHERE status = 'failed' 
      AND attempts < 3
      AND created_at > datetime('now', '-24 hours')
      LIMIT 10
    `).all();
    
    let retriedCount = 0;
    
    for (const task of failedTasks.results as any[]) {
      try {
        // Update attempt count
        await env.DB.prepare(`
          UPDATE processing_queue 
          SET attempts = attempts + 1, status = 'processing', updated_at = ?
          WHERE article_id = ? AND task_type = ?
        `).bind(
          new Date().toISOString(),
          task.article_id,
          task.task_type
        ).run();
        
        // Retry the task
        const article = await env.DB.prepare(
          'SELECT * FROM articles WHERE id = ?'
        ).bind(task.article_id).first();
        
        if (article) {
          switch (task.task_type) {
            case 'extract':
              await handleExtraction({
                article_id: task.article_id,
                url: (article as any).url,
                source_name: (article as any).source_name
              }, env);
              break;
            case 'process':
              await handleProcessing({
                article_id: task.article_id,
                content_key: `articles/${task.article_id}.json`
              }, env);
              break;
            case 'vectorize':
              await handleVectorization({
                article_id: task.article_id,
                content_key: `articles/${task.article_id}.json`,
                analysis_key: `analyses/${task.article_id}.json`
              }, env);
              break;
          }
          retriedCount++;
        }
      } catch (error) {
        console.error(`Retry failed for article ${task.article_id}:`, error);
      }
    }
    
    return new Response(`Retried ${retriedCount} failed tasks`, { status: 200 });
  } catch (error) {
    console.error('Retry operation failed:', error);
    return new Response('Retry operation failed', { status: 500 });
  }
}

async function logError(articleId: number | undefined, taskType: string, error: string, env: Env): Promise<void> {
  try {
    if (articleId) {
      await env.DB.prepare(`
        UPDATE processing_queue 
        SET status = 'failed', updated_at = ?
        WHERE article_id = ? AND task_type = ?
      `).bind(
        new Date().toISOString(),
        articleId,
        taskType
      ).run();
    }
    console.error(`Task ${taskType} failed for article ${articleId}:`, error);
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}
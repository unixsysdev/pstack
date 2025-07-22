interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  RSS_COLLECTOR_URL: string;
  CONTENT_EXTRACTOR_URL: string;
  ORCHESTRATOR_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/trigger-rss' && request.method === 'POST') {
      try {
        const response = await fetch(env.RSS_COLLECTOR_URL + '/trigger', {
          method: 'POST'
        });
        const text = await response.text();
        return new Response(`RSS triggered: ${text}`, { status: response.status });
      } catch (error) {
        return new Response(`RSS trigger failed: ${error}`, { status: 500 });
      }
    }
    
    // Main dashboard
    const html = await generateDashboard(env);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
} satisfies ExportedHandler<Env>;

async function generateDashboard(env: Env): Promise<string> {
  let dbStats = {
    articles: 0,
    rss_sources: 0,
    ai_analyses: 0,
    vector_embeddings: 0,
    processing_queue: 0
  };
  
  let r2Stats = {
    total_objects: 0,
    articles_stored: 0,
    analyses_stored: 0
  };
  
  let errors: string[] = [];
  
  // Get DB stats
  try {
    if (env.DB) {
      const articleCount = await env.DB.prepare('SELECT COUNT(*) as count FROM articles').first();
      dbStats.articles = (articleCount as any)?.count || 0;
      
      const sourceCount = await env.DB.prepare('SELECT COUNT(*) as count FROM rss_sources').first();
      dbStats.rss_sources = (sourceCount as any)?.count || 0;
      
      const analysisCount = await env.DB.prepare('SELECT COUNT(*) as count FROM ai_analyses').first();
      dbStats.ai_analyses = (analysisCount as any)?.count || 0;
      
      const vectorCount = await env.DB.prepare('SELECT COUNT(*) as count FROM vector_embeddings').first();
      dbStats.vector_embeddings = (vectorCount as any)?.count || 0;
      
      const queueCount = await env.DB.prepare('SELECT COUNT(*) as count FROM processing_queue').first();
      dbStats.processing_queue = (queueCount as any)?.count || 0;
    }
  } catch (error) {
    errors.push(`DB Error: ${error}`);
  }
  
  // Get R2 stats
  try {
    if (env.CONTENT_BUCKET) {
      const objects = await env.CONTENT_BUCKET.list();
      r2Stats.total_objects = objects.objects.length;
      
      r2Stats.articles_stored = objects.objects.filter(obj => 
        obj.key.startsWith('articles/')
      ).length;
      
      r2Stats.analyses_stored = objects.objects.filter(obj => 
        obj.key.startsWith('analyses/')
      ).length;
    }
  } catch (error) {
    errors.push(`R2 Error: ${error}`);
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>PStack Intelligence Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .stat-card h3 { margin-top: 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .stat-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .stat-number { font-weight: bold; color: #667eea; }
    .actions { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .btn { background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 10px; margin-bottom: 10px; }
    .btn:hover { background: #5a6fd8; }
    .errors { background: #ffe6e6; border-left: 4px solid #ff4444; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
    .timestamp { color: #666; font-size: 0.9em; margin-top: 20px; }
    .status-good { color: #28a745; }
    .status-warning { color: #ffc107; }
    .status-error { color: #dc3545; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌍 PStack Intelligence Platform</h1>
      <p>Geopolitical Intelligence Pipeline Dashboard</p>
    </div>
    
    ${errors.length > 0 ? `
      <div class="errors">
        <h4>⚠️ Errors:</h4>
        ${errors.map(err => `<div>• ${err}</div>`).join('')}
      </div>
    ` : ''}
    
    <div class="actions">
      <h3>🎯 Actions</h3>
      <button class="btn" onclick="triggerRss()">Trigger RSS Collection</button>
      <button class="btn" onclick="location.reload()">Refresh Dashboard</button>
      <button class="btn" onclick="window.open('/health', '_blank')">Health Check</button>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <h3>📊 Database Statistics</h3>
        <div class="stat-item">
          <span>RSS Sources</span>
          <span class="stat-number">${dbStats.rss_sources}</span>
        </div>
        <div class="stat-item">
          <span>Articles Collected</span>
          <span class="stat-number">${dbStats.articles}</span>
        </div>
        <div class="stat-item">
          <span>AI Analyses</span>
          <span class="stat-number">${dbStats.ai_analyses}</span>
        </div>
        <div class="stat-item">
          <span>Vector Embeddings</span>
          <span class="stat-number">${dbStats.vector_embeddings}</span>
        </div>
        <div class="stat-item">
          <span>Processing Queue</span>
          <span class="stat-number">${dbStats.processing_queue}</span>
        </div>
      </div>
      
      <div class="stat-card">
        <h3>🗄️ R2 Storage Statistics</h3>
        <div class="stat-item">
          <span>Total Objects</span>
          <span class="stat-number">${r2Stats.total_objects}</span>
        </div>
        <div class="stat-item">
          <span>Full Articles Stored</span>
          <span class="stat-number">${r2Stats.articles_stored}</span>
        </div>
        <div class="stat-item">
          <span>AI Analyses Stored</span>
          <span class="stat-number">${r2Stats.analyses_stored}</span>
        </div>
      </div>
      
      <div class="stat-card">
        <h3>⚙️ System Status</h3>
        <div class="stat-item">
          <span>Database Connection</span>
          <span class="${env.DB ? 'status-good' : 'status-error'}">${env.DB ? '✅ Connected' : '❌ Failed'}</span>
        </div>
        <div class="stat-item">
          <span>R2 Storage</span>
          <span class="${env.CONTENT_BUCKET ? 'status-good' : 'status-error'}">${env.CONTENT_BUCKET ? '✅ Connected' : '❌ Failed'}</span>
        </div>
        <div class="stat-item">
          <span>RSS Collector</span>
          <span class="${env.RSS_COLLECTOR_URL ? 'status-good' : 'status-warning'}">🔄 Configured</span>
        </div>
      </div>
    </div>
    
    <div class="timestamp">
      Last updated: ${new Date().toISOString()}
    </div>
  </div>
  
  <script>
    async function triggerRss() {
      const btn = event.target;
      btn.textContent = 'Triggering...';
      btn.disabled = true;
      
      try {
        const response = await fetch('/trigger-rss', { method: 'POST' });
        const text = await response.text();
        alert('RSS Collection: ' + text);
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        btn.textContent = 'Trigger RSS Collection';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
  `;
}
interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
}

async function getDashboardData(env: Env) {
  try {
    // Get queue stats
    let queueStats = { pending: 0, processing: 0, completed_today: 0, failed_today: 0, worker_health: {} };
    try {
      const queueResponse = await fetch('https://queue-manager.marcelbutucea.workers.dev/stats');
      if (queueResponse.ok) queueStats = await queueResponse.json();
    } catch (e) { console.log('Queue manager not available'); }

    // Get RSS stats with proper column names
    let rssStats = { total_sources: 0, active_sources: 0, failed_sources: 0, articles_today: 0 };
    try {
      const [total, active, failed, today] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources WHERE active = 1").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources WHERE last_error IS NOT NULL").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE DATE(created_at) = DATE('now')").first()
      ]);
      
      rssStats = {
        total_sources: total?.count || 0,
        active_sources: active?.count || 0,
        failed_sources: failed?.count || 0,
        articles_today: today?.count || 0
      };
    } catch (e) { console.log('RSS stats error:', e); }

    // Get vector stats with timeout
    let vectorStats = { total_vectors: 0, vectorized_articles: 0, vectorized_today: 0, vectorization_rate: '0%' };
    try {
      const vectorResponse = await fetch('https://vector-worker.marcelbutucea.workers.dev/stats', {
        cf: { timeout: 10000 }
      });
      if (vectorResponse.ok) {
        const vectorData = await vectorResponse.json();
        console.log('Vector stats received:', vectorData);
        vectorStats = { ...vectorStats, ...vectorData };
      } else {
        console.log('Vector stats response not ok:', vectorResponse.status, await vectorResponse.text());
      }
    } catch (e) { 
      console.log('Vector stats error:', e.message, e.stack);
      // Fallback to database query for vector stats
      try {
        const dbVectorStats = await env.DB.prepare("SELECT COUNT(*) as count FROM vector_embeddings").first();
        const dbVectorizedArticles = await env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%vectorized%'").first();
        vectorStats.total_vectors = dbVectorStats?.count || 0;
        vectorStats.vectorized_articles = dbVectorizedArticles?.count || 0;
        console.log('Using fallback vector stats:', vectorStats);
      } catch (dbE) {
        console.log('Fallback vector stats error:', dbE);
      }
    }

    // Get AI summary stats with timeout
    let summaryStats = { total_summaries: 0, summaries_today: 0, summarized_articles: 0, summary_rate: '0%' };
    try {
      const summaryResponse = await fetch('https://ai-summarizer.marcelbutucea.workers.dev/stats', {
        cf: { timeout: 10000 }
      });
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        console.log('Summary stats received:', summaryData);
        summaryStats = { ...summaryStats, ...summaryData };
      } else {
        console.log('Summary stats response not ok:', summaryResponse.status, await summaryResponse.text());
      }
    } catch (e) { 
      console.log('Summary stats error:', e.message, e.stack);
      // Fallback to database query for summary stats
      try {
        const dbSummaryStats = await env.DB.prepare("SELECT COUNT(*) as count FROM ai_summaries").first();
        const dbSummariesToday = await env.DB.prepare("SELECT COUNT(*) as count FROM ai_summaries WHERE DATE(created_at) = DATE('now')").first();
        summaryStats.total_summaries = dbSummaryStats?.count || 0;
        summaryStats.summaries_today = dbSummariesToday?.count || 0;
        console.log('Using fallback summary stats:', summaryStats);
      } catch (dbE) {
        console.log('Fallback summary stats error:', dbE);
      }
    }

    // Get database stats and tags
    const [
      articlesTotal, articlesExtracted, articlesVectorized, articlesSummarized, articlesFailed,
      recentArticles, sourcesData, r2Objects, queueJobs, dailyTags, taggedArticles
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%extracted%'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%vectorized%'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%summarized%'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%failed%'").first(),
      env.DB.prepare("SELECT id, title, url, status, source_name, created_at FROM articles ORDER BY created_at DESC LIMIT 15").all(),
      env.DB.prepare("SELECT name, last_error, error_count FROM rss_sources WHERE last_error IS NOT NULL ORDER BY error_count DESC LIMIT 10").all(),
      env.CONTENT_BUCKET.list({ limit: 1000 }),
      env.DB.prepare("SELECT type, status, COUNT(*) as count FROM queue_jobs GROUP BY type, status").all(),
      env.DB.prepare(`
        SELECT dt.tag_name, dt.tag_description, dt.article_count, dt.created_at,
               GROUP_CONCAT(a.title, ' | ') as sample_titles
        FROM daily_tags dt
        LEFT JOIN article_tags at ON dt.id = at.tag_id  
        LEFT JOIN articles a ON at.article_id = a.id
        WHERE DATE(dt.created_date) = DATE('now')
        GROUP BY dt.id
        ORDER BY dt.article_count DESC
        LIMIT 12
      `).all(),
      env.DB.prepare(`
        SELECT a.id, a.title, a.status, a.source_name, a.created_at,
               GROUP_CONCAT(dt.tag_name, ', ') as tags
        FROM articles a
        JOIN article_tags at ON a.id = at.article_id
        JOIN daily_tags dt ON at.tag_id = dt.id
        WHERE DATE(a.created_at) = DATE('now')
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT 10
      `).all()
    ]);

    return {
      queueStats,
      rssStats,
      vectorStats,
      summaryStats,
      pipeline: {
        total_articles: articlesTotal?.count || 0,
        extracted_articles: articlesExtracted?.count || 0,
        vectorized_articles: articlesVectorized?.count || 0,
        summarized_articles: articlesSummarized?.count || 0,
        failed_articles: articlesFailed?.count || 0,
        r2_objects: r2Objects.objects?.length || 0
      },
      recentArticles: recentArticles.results || [],
      failedSources: sourcesData.results || [],
      queueBreakdown: queueJobs.results || [],
      dailyTags: dailyTags.results || [],
      taggedArticles: taggedArticles.results || []
    };
  } catch (error) {
    console.error('Dashboard data error:', error);
    throw error;
  }
}

function renderDashboard(data: any): string {
  const { queueStats, rssStats, vectorStats, summaryStats, pipeline, recentArticles, failedSources, queueBreakdown, dailyTags, taggedArticles } = data;
  
  const failedSourcesHTML = failedSources.map((source: any) => `
    <div class="failed-item">
      <div class="failed-name">${source.name}</div>
      <div class="failed-error">${source.last_error?.substring(0, 100) || 'Unknown error'}...</div>
      <div class="failed-count">${source.error_count} errors</div>
    </div>
  `).join('') || '<div class="no-data">No failed sources</div>';

  const recentArticlesHTML = recentArticles.slice(0, 10).map((article: any) => `
    <div class="article-row">
      <div class="article-title">
        <a href="/article/${article.id}">
          ${article.title?.substring(0, 80) || 'No title'}...
        </a>
      </div>
      <div class="article-meta">
        <span class="badge badge-${article.status.replace('_', '-')}">${article.status}</span>
        <span class="source">${article.source_name}</span>
        <span class="time">${new Date(article.created_at).toLocaleTimeString()}</span>
      </div>
    </div>
  `).join('') || '<div class="no-data">No recent articles</div>';

  const queueBreakdownHTML = queueBreakdown.map((item: any) => `
    <div class="queue-row">
      <span class="queue-type">${item.type}</span>
      <span class="badge badge-${item.status}">${item.status}</span>
      <span class="queue-count">${item.count}</span>
    </div>
  `).join('') || '<div class="no-data">No queue data</div>';

  const taggedArticlesHTML = taggedArticles.length > 0 ? taggedArticles.map((article: any) => `
    <div class="tagged-article-row">
      <div class="tagged-article-title">
        <a href="/article/${article.id}">${article.title}</a>
      </div>
      <div class="tagged-article-tags">
        ${article.tags ? article.tags.split(', ').map((tag: string) => 
          `<span class="mini-tag" onclick="exploreTag('${tag}')">${tag}</span>`
        ).join('') : ''}
      </div>
      <div class="tagged-article-meta">
        <span class="source">${article.source_name}</span>
        <span class="status badge badge-${article.status.replace('_', '-')}">${article.status}</span>
      </div>
    </div>
  `).join('') : '<div class="no-data">No tagged articles today</div>';

  return `<!DOCTYPE html>
<html>
<head>
  <title>PStack Intelligence Platform</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --primary: #0f172a;
      --secondary: #1e293b;
      --accent: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --card-bg: #1e293b;
      --gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--gradient);
      min-height: 100vh;
      color: var(--text);
      line-height: 1.6;
    }
    
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 24px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 32px;
      padding: 32px;
      background: rgba(30, 41, 59, 0.8);
      border-radius: 16px;
      border: 1px solid var(--border);
      backdrop-filter: blur(10px);
    }
    
    .header h1 {
      font-size: 3rem;
      font-weight: 800;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .header p {
      color: var(--text-muted);
      font-size: 1.1rem;
    }
    
    .status-indicators {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid var(--accent);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    
    .indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    .metric-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      border-color: var(--accent);
    }
    
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--success));
    }
    
    .metric-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }
    
    .metric-label {
      color: var(--text-muted);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }
    
    .metric-trend {
      font-size: 0.8rem;
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      display: inline-block;
    }
    
    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(148, 163, 184, 0.2);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 12px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--success));
      transition: width 0.6s ease;
      border-radius: 3px;
    }
    
    .section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    .section-title {
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .section-title::before {
      content: '';
      width: 4px;
      height: 24px;
      background: var(--accent);
      border-radius: 2px;
    }
    
    .controls {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn:hover {
      background: #2563eb;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
    }
    
    .btn:disabled {
      background: var(--border);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    
    .btn.success { background: var(--success); }
    .btn.success:hover { background: #059669; }
    .btn.warning { background: var(--warning); }
    .btn.warning:hover { background: #d97706; }
    .btn.danger { background: var(--danger); }
    .btn.danger:hover { background: #dc2626; }
    
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
    }
    
    .article-row, .queue-row, .failed-item {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s ease;
    }
    
    .article-row:hover, .queue-row:hover, .failed-item:hover {
      background: rgba(59, 130, 246, 0.05);
    }
    
    .article-title, .failed-name {
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }
    
    .article-title a {
      color: var(--text);
      text-decoration: none;
      transition: color 0.2s ease;
    }
    
    .article-title a:hover {
      color: var(--accent);
    }
    
    .article-meta {
      display: flex;
      gap: 16px;
      align-items: center;
      font-size: 0.85rem;
      flex-wrap: wrap;
    }
    
    .badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .badge-pending { background: rgba(59, 130, 246, 0.2); color: var(--accent); }
    .badge-extracting, .badge-processing { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .badge-extracted-fetch, .badge-vectorized, .badge-summarized, .badge-completed { 
      background: rgba(16, 185, 129, 0.2); color: var(--success); 
    }
    .badge-failed, .badge-extraction-failed, .badge-vectorization-failed, .badge-summarization-failed { 
      background: rgba(239, 68, 68, 0.2); color: var(--danger); 
    }
    .badge-vectorizing, .badge-summarizing { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
    
    .source, .time {
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    
    .search-box {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--primary);
      color: var(--text);
      font-size: 16px;
      margin-bottom: 20px;
      transition: border-color 0.2s ease;
    }
    
    .search-box:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .search-box::placeholder {
      color: var(--text-muted);
    }
    
    .no-data {
      text-align: center;
      color: var(--text-muted);
      padding: 24px;
      font-style: italic;
    }
    
    .failed-error {
      color: var(--danger);
      font-size: 0.8rem;
      margin: 4px 0;
      font-family: 'Monaco', 'Consolas', monospace;
    }
    
    .failed-count {
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    
    .queue-type {
      font-weight: 600;
      color: var(--text);
      text-transform: capitalize;
    }
    
    .queue-count {
      font-weight: 700;
      color: var(--accent);
      margin-left: auto;
    }
    
    @media (max-width: 1024px) {
      .grid-2, .grid-3 {
        grid-template-columns: 1fr;
      }
      
      .metrics-grid {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }
      
      .controls {
        flex-direction: column;
      }
      
      .status-indicators {
        flex-direction: column;
        align-items: center;
      }
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 16px;
      }
      
      .header h1 {
        font-size: 2rem;
      }
      
      .article-meta {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌍 PStack Intelligence Platform</h1>
      <p>Advanced Geopolitical Intelligence Processing with Queue-Based Architecture</p>
      <div class="status-indicators">
        <div class="status-indicator">
          <div class="indicator-dot"></div>
          Queue System Active
        </div>
        <div class="status-indicator">
          <div class="indicator-dot"></div>
          AI Processing Enabled
        </div>
        <div class="status-indicator">
          <div class="indicator-dot"></div>
          Vector Search Ready
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${pipeline.total_articles}</div>
        <div class="metric-label">Total Articles</div>
        <div class="metric-trend">+${rssStats.articles_today} today</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${pipeline.extracted_articles}</div>
        <div class="metric-label">Extracted</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pipeline.total_articles > 0 ? (pipeline.extracted_articles / pipeline.total_articles * 100) : 0}%"></div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${pipeline.vectorized_articles}</div>
        <div class="metric-label">Vectorized</div>
        <div class="metric-trend">${vectorStats.vectorization_rate}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pipeline.total_articles > 0 ? (pipeline.vectorized_articles / pipeline.total_articles * 100) : 0}%"></div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${pipeline.summarized_articles}</div>
        <div class="metric-label">AI Summaries</div>
        <div class="metric-trend">${summaryStats.summary_rate}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pipeline.total_articles > 0 ? (pipeline.summarized_articles / pipeline.total_articles * 100) : 0}%"></div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${queueStats.pending}</div>
        <div class="metric-label">Queue Pending</div>
        <div class="metric-trend">${queueStats.processing} processing</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${rssStats.active_sources}</div>
        <div class="metric-label">RSS Sources</div>
        <div class="metric-trend">${rssStats.failed_sources} failed</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${pipeline.r2_objects}</div>
        <div class="metric-label">R2 Objects</div>
        <div class="metric-trend">Content Storage</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${vectorStats.total_vectors || 0}</div>
        <div class="metric-label">Vector Embeddings</div>
        <div class="metric-trend">Similarity Ready</div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">🔄 Pipeline Controls</h2>
      <div class="controls">
        <button class="btn" onclick="collectRSS()">
          📡 Collect RSS
        </button>
        <button class="btn" onclick="batchExtract()">
          🔍 Batch Extract
        </button>
        <button class="btn" onclick="processVectors()">
          🧠 Process Vectors
        </button>
        <button class="btn" onclick="processSummaries()">
          📝 AI Summaries
        </button>
        <button class="btn warning" onclick="processQueue()">
          ⚡ Process All Queues
        </button>
        <button class="btn success" onclick="refreshDashboard()">
          🔄 Refresh
        </button>
      </div>
    </div>
    
    <div class="grid-2">
      
      <div class="section">
        <h2 class="section-title">📋 Recent Articles</h2>
        <input type="text" class="search-box" placeholder="Search articles..." onkeyup="searchArticles(this.value)">
        <div id="articles-list">
          ${recentArticlesHTML}
        </div>
      </div>
    </div>
    
    <div class="grid-2">
      <div class="section">
        <h2 class="section-title">🔄 Queue Status</h2>
        ${queueBreakdownHTML}
      </div>
      
      <div class="section">
        <h2 class="section-title">🔍 Similarity Search</h2>
        <input type="text" class="search-box" placeholder="Search for similar articles..." onkeyup="searchSimilar(this.value)">
        <div id="similarity-results">
          <div class="no-data">Enter search terms to find similar articles</div>
        </div>
      </div>
    </div>
    
      
      ${failedSources.length > 0 ? `
      <div class="section">
        <h2 class="section-title">❌ Failed RSS Sources</h2>
        ${failedSourcesHTML}
      </div>
      ` : `
      <div class="section">
        <h2 class="section-title">✅ All Sources Healthy</h2>
        <div class="no-data">No RSS source failures detected</div>
      </div>
      `}
    </div>
  </div>
  
  <script>
    let searchTimeout;
    
    async function collectRSS() {
      await performAction('Collecting RSS feeds...', async () => {
        const response = await fetch('https://rss-collector.marcelbutucea.workers.dev/collect', { method: 'POST' });
        const result = await response.json();
        return result.message || 'RSS collection completed';
      });
    }
    
    async function batchExtract() {
      await performAction('Creating extraction jobs...', async () => {
        const response = await fetch('https://content-extractor.marcelbutucea.workers.dev/batch-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 20 })
        });
        const result = await response.json();
        return \`\${result.jobs_created} extraction jobs created\`;
      });
    }
    
    async function processVectors() {
      await performAction('Processing vector jobs...', async () => {
        const response = await fetch('https://vector-worker.marcelbutucea.workers.dev/process', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        
        const result = await response.json();
        return \`✅ \${result.processed_jobs || 0} vector jobs processed\`;
      });
    }
    
    async function processSummaries() {
      await performAction('Processing AI summaries...', async () => {
        const response = await fetch('https://ai-summarizer.marcelbutucea.workers.dev/process', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        
        const result = await response.json();
        return \`✅ \${result.processed_jobs || 0} AI summary jobs processed\`;
      });
    }
    
    async function processQueue() {
      await performAction('Processing all queues...', async () => {
        const services = [
          { name: 'Content Extractor', url: 'https://content-extractor.marcelbutucea.workers.dev/process' },
          { name: 'Vector Worker', url: 'https://vector-worker.marcelbutucea.workers.dev/process' },
          { name: 'AI Summarizer', url: 'https://ai-summarizer.marcelbutucea.workers.dev/process' }
        ];
        
        const results = [];
        for (const service of services) {
          try {
            const response = await fetch(service.url, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
              const result = await response.json();
              results.push({ service: service.name, jobs: result.processed_jobs || 0 });
            } else {
              results.push({ service: service.name, jobs: 0, error: response.status });
            }
          } catch (error) {
            results.push({ service: service.name, jobs: 0, error: 'failed' });
          }
        }
        
        const total = results.reduce((sum, r) => sum + r.jobs, 0);
        const details = results.map(r => \`\${r.service}: \${r.jobs}\${r.error ? ' (error)' : ''}\`).join(', ');
        return \`✅ \${total} total jobs processed - \${details}\`;
      });
    }
    
    
    async function performAction(loadingText, action) {
      const btn = event.target;
      const originalText = btn.innerHTML;
      
      btn.innerHTML = '⏳ ' + loadingText;
      btn.disabled = true;
      
      try {
        const message = await action();
        alert(message);
        setTimeout(() => refreshDashboard(), 1000);
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
    
    function refreshDashboard() {
      location.reload();
    }
    
    function searchArticles(query) {
      const articles = document.querySelectorAll('.article-row');
      articles.forEach(article => {
        const text = article.textContent.toLowerCase();
        article.style.display = text.includes(query.toLowerCase()) ? 'block' : 'none';
      });
    }
    
    function searchSimilar(query) {
      clearTimeout(searchTimeout);
      
      if (query.length < 3) {
        document.getElementById('similarity-results').innerHTML = 
          '<div class="no-data">Enter at least 3 characters to search</div>';
        return;
      }
      
      searchTimeout = setTimeout(async () => {
        try {
          document.getElementById('similarity-results').innerHTML = 
            '<div class="no-data">Searching...</div>';
            
          const response = await fetch('https://vector-worker.marcelbutucea.workers.dev/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 5 })
          });
          
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const resultsHTML = data.results.map(item => \`
              <div class="article-row">
                <div class="article-title">\${item.title}</div>
                <div class="article-meta">
                  <span class="badge badge-vectorized">Score: \${(item.similarity_score * 100).toFixed(1)}%</span>
                  <span class="source">\${item.source}</span>
                  <span class="time">\${item.category}</span>
                </div>
              </div>
            \`).join('');
            
            document.getElementById('similarity-results').innerHTML = resultsHTML;
          } else {
            document.getElementById('similarity-results').innerHTML = 
              '<div class="no-data">No similar articles found</div>';
          }
        } catch (error) {
          document.getElementById('similarity-results').innerHTML = 
            '<div class="no-data">Search error: ' + error.message + '</div>';
        }
      }, 500);
    }
    
    // Auto-refresh every 60 seconds
    setInterval(refreshDashboard, 60000);
  </script>
</body>
</html>`;
}

async function renderArticleDetail(articleId: string, env: Env): Promise<string> {
  try {
    // Get article details
    const article = await env.DB.prepare(`
      SELECT id, title, url, content, description, status, source_name, created_at, processed_at
      FROM articles WHERE id = ?
    `).bind(articleId).first();
    
    if (!article) {
      return `<html><body><h1>Article not found</h1><a href="/">Back to Dashboard</a></body></html>`;
    }
    
    // Get AI summary if available
    let aiSummary = null;
    try {
      const summaryResult = await env.DB.prepare(`
        SELECT summary, created_at FROM ai_summaries WHERE article_id = ?
      `).bind(articleId).first();
      aiSummary = summaryResult;
    } catch (e) {
      console.log('No AI summary found for article', articleId);
    }
    
    // Get full content from R2 if available
    let fullContent = article.content || '';
    try {
      const contentObj = await env.CONTENT_BUCKET.get(`content/article_${articleId}.json`);
      if (contentObj) {
        const contentData = JSON.parse(await contentObj.text());
        fullContent = contentData.content || article.content || '';
      }
    } catch (e) {
      console.log('No R2 content found for article', articleId);
    }
    
    // Get similar articles
    let similarArticles = [];
    try {
      const similarResponse = await fetch(`https://vector-worker.marcelbutucea.workers.dev/similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: parseInt(articleId), limit: 5 })
      });
      if (similarResponse.ok) {
        const similarData = await similarResponse.json();
        similarArticles = similarData.similar_articles || [];
      }
    } catch (e) {
      console.log('Could not fetch similar articles');
    }
    
    const similarArticlesHTML = similarArticles.length > 0 ? 
      similarArticles.map(sim => `
        <div class="similar-article">
          <div class="similar-title">
            <a href="/article/${sim.article_id}">${sim.title}</a>
          </div>
          <div class="similar-meta">
            <span class="similarity-score">${(sim.similarity_score * 100).toFixed(1)}% similar</span>
            <span class="source">${sim.source}</span>
          </div>
        </div>
      `).join('') : '<div class="no-data">No similar articles found</div>';
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>${article.title} - PStack Intelligence</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --primary: #0f172a;
      --secondary: #1e293b;
      --accent: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--primary);
      color: var(--text);
      line-height: 1.6;
    }
    
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--border);
    }
    
    .back-link {
      color: var(--accent);
      text-decoration: none;
      padding: 12px 24px;
      border: 1px solid var(--accent);
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    
    .back-link:hover {
      background: var(--accent);
      color: var(--primary);
    }
    
    .article-header {
      margin-bottom: 40px;
    }
    
    .article-title {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.2;
    }
    
    .article-meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      color: var(--text-muted);
      margin-bottom: 20px;
    }
    
    .badge {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    
    .badge-extracted { background: var(--success); color: white; }
    .badge-vectorized { background: var(--accent); color: white; }
    .badge-summarized { background: var(--warning); color: white; }
    .badge-failed { background: var(--danger); color: white; }
    
    .content-section {
      background: var(--secondary);
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--accent);
    }
    
    .article-content {
      font-size: 1.1rem;
      line-height: 1.8;
      color: var(--text);
    }
    
    .article-content p {
      margin-bottom: 16px;
    }
    
    .ai-summary {
      background: linear-gradient(135deg, var(--secondary), #2d3748);
      border-left: 4px solid var(--accent);
      white-space: pre-wrap;
    }
    
    .similar-article {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s ease;
    }
    
    .similar-article:hover {
      background: rgba(59, 130, 246, 0.05);
    }
    
    .similar-title a {
      color: var(--text);
      text-decoration: none;
      font-weight: 600;
    }
    
    .similar-title a:hover {
      color: var(--accent);
    }
    
    .similar-meta {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    /* Tag Interface Styles */
    .tags-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .tag-card {
      background: var(--card-bg);
      background-image: linear-gradient(135deg, rgba(59, 130, 246, 0.1), transparent);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      display: block;
    }

    .tag-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 32px rgba(59, 130, 246, 0.15);
      border-color: var(--accent);
    }

    .tag-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .tag-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--accent);
      line-height: 1.2;
    }

    .tag-count {
      background: var(--accent);
      color: white;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .tag-description {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 12px;
      line-height: 1.4;
    }

    .tag-preview {
      margin-bottom: 12px;
    }

    .preview-title {
      color: var(--text);
      font-size: 0.85rem;
      margin-bottom: 4px;
      opacity: 0.8;
    }

    .tag-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
    }

    .tag-time {
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .tag-action {
      color: var(--accent);
      font-weight: 600;
      font-size: 0.9rem;
    }

    .no-tags-state {
      text-align: center;
      padding: 60px 20px;
      background: var(--secondary);
      border-radius: 12px;
      border: 2px dashed var(--border);
    }

    .no-tags-icon {
      font-size: 3rem;
      margin-bottom: 16px;
    }

    .no-tags-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }

    .no-tags-desc {
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .generate-tags-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .generate-tags-btn:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }

    .tagged-article-row {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s ease;
    }

    .tagged-article-row:hover {
      background: rgba(59, 130, 246, 0.05);
    }

    .tagged-article-title {
      margin-bottom: 8px;
    }

    .tagged-article-title a {
      color: var(--text);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    .tagged-article-title a:hover {
      color: var(--accent);
    }

    .tagged-article-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }

    .mini-tag {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mini-tag:hover {
      background: var(--accent);
      color: white;
    }

    .tagged-article-meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 0.85rem;
    }
    
    .similarity-score {
      color: var(--success);
      font-weight: 600;
    }
    
    .no-data {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      padding: 40px;
    }
    
    .original-link {
      display: inline-block;
      color: var(--accent);
      text-decoration: none;
      margin-top: 20px;
      padding: 12px 24px;
      border: 1px solid var(--accent);
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    
    .original-link:hover {
      background: var(--accent);
      color: var(--primary);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📰 Article Details</h1>
      <a href="/" class="back-link">← Back to Dashboard</a>
    </div>
    
    <div class="article-header">
      <h1 class="article-title">${article.title}</h1>
      <div class="article-meta">
        <span class="badge badge-${article.status?.replace('_', '-') || 'pending'}">${article.status || 'pending'}</span>
        <span><strong>Source:</strong> ${article.source_name}</span>
        <span><strong>Published:</strong> ${new Date(article.created_at).toLocaleString()}</span>
        ${article.processed_at ? `<span><strong>Processed:</strong> ${new Date(article.processed_at).toLocaleString()}</span>` : ''}
      </div>
      <a href="${article.url}" target="_blank" class="original-link">🔗 Read Original Article</a>
    </div>
    
    ${aiSummary ? `
    <div class="content-section ai-summary">
      <h2 class="section-title">🤖 AI Analysis & Summary</h2>
      <div class="article-content">${aiSummary.summary}</div>
      <div style="margin-top: 20px; font-size: 0.9rem; color: var(--text-muted);">
        <strong>Generated:</strong> ${new Date(aiSummary.created_at).toLocaleString()}
      </div>
    </div>
    ` : ''}
    
    ${fullContent ? `
    <div class="content-section">
      <h2 class="section-title">📄 Full Content</h2>
      <div class="article-content">${fullContent.substring(0, 5000)}${fullContent.length > 5000 ? '...' : ''}</div>
    </div>
    ` : ''}
    
    <div class="content-section">
      <h2 class="section-title">🔍 Similar Articles</h2>
      ${similarArticlesHTML}
    </div>
  </div>
</body>
</html>`;
  } catch (error) {
    console.error('Article detail error:', error);
    return `<html><body><h1>Error loading article</h1><p>${error.message}</p><a href="/">Back to Dashboard</a></body></html>`;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        const data = await getDashboardData(env);
        const html = renderDashboard(data);
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }
      
      if (url.pathname === '/api/stats') {
        const data = await getDashboardData(env);
        return Response.json(data);
      }
      
      if (url.pathname.startsWith('/article/')) {
        const articleId = url.pathname.split('/')[2];
        if (articleId) {
          const html = await renderArticleDetail(articleId, env);
          return new Response(html, { headers: { 'Content-Type': 'text/html' } });
        }
      }
      
      if (url.pathname === '/health') {
        return Response.json({ status: 'Dashboard operational', timestamp: new Date().toISOString() });
      }
      
      return new Response('PStack Dashboard', { status: 404 });
      
    } catch (error) {
      console.error('Dashboard error:', error);
      return new Response(`Dashboard Error: ${error}`, { status: 500 });
    }
  }
};
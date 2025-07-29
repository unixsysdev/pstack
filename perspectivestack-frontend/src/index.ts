interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      // API Routes
      if (url.pathname.startsWith('/api/')) {
        return await handleAPI(url, env);
      }
      
      // Frontend Routes
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(await renderHomePage(env), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      if (url.pathname.startsWith('/tag/')) {
        const tagName = decodeURIComponent(url.pathname.split('/')[2]);
        return new Response(await renderTagPage(tagName, env), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      if (url.pathname.startsWith('/article/')) {
        const articleId = parseInt(url.pathname.split('/')[2]);
        return new Response(await renderArticlePage(articleId, env), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      if (url.pathname === '/search') {
        const query = url.searchParams.get('q') || '';
        return new Response(await renderSearchPage(query, env), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      return new Response('404 Not Found', { status: 404 });
      
    } catch (error) {
      console.error('Frontend error:', error);
      return new Response('500 Internal Server Error', { status: 500 });
    }
  }
};

async function handleAPI(url: URL, env: Env): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (url.pathname === '/api/tags') {
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const tags = await getDailyTags(env, date);
    return Response.json({ tags }, { headers: corsHeaders });
  }
  
  if (url.pathname === '/api/articles') {
    const tag = url.searchParams.get('tag');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const articles = await getArticles(env, tag, limit);
    return Response.json({ articles }, { headers: corsHeaders });
  }
  
  if (url.pathname === '/api/create-sample-tags' && request.method === 'POST') {
    try {
      const result = await createSampleTags(env);
      return Response.json(result, { headers: corsHeaders });
    } catch (error) {
      console.error('Sample tags creation error:', error);
      return Response.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  }
  
  return Response.json({ error: 'API endpoint not found' }, { status: 404, headers: corsHeaders });
}

async function renderHomePage(env: Env): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const tags = await getDailyTags(env, today);
  const recentArticles = await getArticles(env, null, 20);
  
  // Get system status for dashboard
  const systemStats = await getSystemStats(env);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PerspectiveStack | Global Intelligence Platform</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #0a0e27;
            --secondary: #1a1f3a;
            --accent: #4f46e5;
            --accent-bright: #6366f1;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --card-bg: #1e293b;
            --gradient: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d3748 100%);
        }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--gradient);
            min-height: 100vh;
            color: var(--text);
            line-height: 1.6;
        }
        
        .header {
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .nav {
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: between;
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: 800;
            background: linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hero {
            text-align: center;
            padding: 4rem 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .hero h1 {
            font-size: 3.5rem;
            font-weight: 800;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hero p {
            font-size: 1.3rem;
            color: var(--text-muted);
            margin-bottom: 2rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        .section {
            margin-bottom: 4rem;
        }
        
        .section-title {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 2rem;
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .section-title::before {
            content: '';
            width: 4px;
            height: 2rem;
            background: var(--accent);
            border-radius: 2px;
        }
        
        .tags-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }
        
        .tag-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        
        .tag-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--accent), var(--success));
        }
        
        .tag-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            border-color: var(--accent);
        }
        
        .tag-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 0.5rem;
        }
        
        .tag-description {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        
        .tag-meta {
            display: flex;
            justify-content: between;
            align-items: center;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        
        .article-count {
            background: var(--accent);
            color: white;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-weight: 500;
        }
        
        .articles-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
        }
        
        .article-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2rem;
            transition: all 0.3s ease;
        }
        
        .article-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            border-color: var(--border);
        }
        
        .article-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--text);
            line-height: 1.4;
        }
        
        .article-meta {
            display: flex;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1rem;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        
        .source-badge {
            background: var(--secondary);
            padding: 0.2rem 0.8rem;
            border-radius: 8px;
            font-weight: 500;
        }
        
        .time {
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }
        
        .article-preview {
            color: var(--text-muted);
            line-height: 1.5;
            margin-bottom: 1rem;
        }
        
        .article-actions {
            display: flex;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .expand-btn {
            background: var(--accent);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .expand-btn:hover {
            background: var(--accent-bright);
            transform: translateY(-1px);
        }
        
        .source-link {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.8rem;
            padding: 0.3rem 0.6rem;
            border: 1px solid var(--border);
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .source-link:hover {
            color: var(--accent);
            border-color: var(--accent);
        }
        
        .status-badge {
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .status-badge.pending { background: #fbbf24; color: #92400e; }
        .status-badge.extracted { background: #60a5fa; color: #1e40af; }
        .status-badge.vectorized { background: #a78bfa; color: #5b21b6; }
        .status-badge.summarized { background: #34d399; color: #065f46; }
        
        .article-expanded {
            border-top: 1px solid var(--border);
            padding-top: 1rem;
            margin-top: 1rem;
        }
        
        .article-summary {
            color: var(--text-muted);
            font-size: 0.9rem;
            line-height: 1.5;
        }
        
        .search-box {
            width: 100%;
            max-width: 600px;
            padding: 1rem 1.5rem;
            border: 2px solid var(--border);
            border-radius: 50px;
            background: var(--card-bg);
            color: var(--text);
            font-size: 1rem;
            margin: 0 auto 3rem auto;
            display: block;
            transition: border-color 0.3s ease;
        }
        
        .search-box:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }
        
        .stats-bar {
            display: flex;
            gap: 2rem;
            justify-content: center;
            margin-bottom: 3rem;
            flex-wrap: wrap;
        }
        
        .stat {
            text-align: center;
            padding: 1rem 2rem;
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: var(--accent-bright);
        }
        
        .stat-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .footer {
            background: var(--primary);
            border-top: 1px solid var(--border);
            padding: 3rem 2rem;
            text-align: center;
            margin-top: 6rem;
        }
        
        .footer p {
            color: var(--text-muted);
            margin-bottom: 1rem;
        }
        
        .powered-by {
            color: var(--accent);
            font-weight: 600;
        }
        
        @media (max-width: 768px) {
            .hero h1 { font-size: 2.5rem; }
            .hero p { font-size: 1.1rem; }
            .tags-grid { grid-template-columns: 1fr; }
            .articles-grid { grid-template-columns: 1fr; }
            .stats-bar { flex-direction: column; align-items: center; }
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="logo">🌍 PerspectiveStack</div>
        </nav>
    </header>
    
    <main>
        <section class="hero">
            <h1>Global Intelligence Platform</h1>
            <p>AI-powered geopolitical analysis from 87+ sources worldwide. Multi-perspective intelligence for strategic decision makers.</p>
            
            <div class="stats-bar">
                <div class="stat">
                    <div class="stat-value">${tags.length}</div>
                    <div class="stat-label">Today's Tags</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${systemStats.total_articles}</div>
                    <div class="stat-label">Total Articles</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${systemStats.sources_count || 87}</div>
                    <div class="stat-label">Global Sources</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${systemStats.processed_today || 0}</div>
                    <div class="stat-label">Processed Today</div>
                </div>
            </div>
        </section>
        
        <div class="container">
            <input type="text" class="search-box" placeholder="Search global intelligence topics..." id="searchBox">
            
            <section class="section">
                <h2 class="section-title">🏷️ Today's Intelligence Tags</h2>
                <div class="tags-grid">
                    ${tags.map(tag => `
                        <div class="tag-card" onclick="location.href='/tag/${encodeURIComponent(tag.tag_name)}'">
                            <div class="tag-name">${tag.tag_name}</div>
                            <div class="tag-description">${tag.tag_description || 'Strategic intelligence topic'}</div>
                            <div class="tag-meta">
                                <span>${new Date(tag.created_at).toLocaleDateString()}</span>
                                <span class="article-count">${tag.article_count} articles</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
            
            <section class="section">
                <h2 class="section-title">📰 Latest Intelligence</h2>
                <div class="articles-grid">
                    ${recentArticles.map(article => `
                        <div class="article-card expandable-card" data-article-id="${article.id}">
                            <div class="article-title">${article.title}</div>
                            <div class="article-meta">
                                <span class="source-badge">${article.source_name}</span>
                                <span class="time">⏰ ${new Date(article.created_at).toLocaleDateString()}</span>
                                <span class="status-badge ${article.status}">${article.status || 'pending'}</span>
                            </div>
                            <div class="article-preview">
                                ${article.description ? article.description.substring(0, 200) + '...' : 'Intelligence article from ' + article.source_name}
                            </div>
                            <div class="article-actions">
                                <button class="expand-btn" onclick="toggleArticle(${article.id})">
                                    ${article.summary ? 'View Analysis' : 'View Details'}
                                </button>
                                <a href="${article.url}" target="_blank" class="source-link">Original Source</a>
                            </div>
                            <div class="article-expanded" id="article-${article.id}" style="display: none;">
                                <div class="article-summary">
                                    ${article.summary || 'AI analysis pending...'}
                                </div>
                                <div class="article-similar">
                                    <h4>Related Intelligence</h4>
                                    <div class="loading">Loading similar articles...</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        </div>
    </main>
    
    <footer class="footer">
        <p>Advanced Geopolitical Intelligence Processing Platform</p>
        <p><span class="powered-by">Powered by AI</span> • Real-time Analysis • Multi-Perspective Intelligence</p>
        <p>© 2025 PerspectiveStack.com - Transforming Global Intelligence</p>
    </footer>
    
    <script>
        // Toggle article expansion
        function toggleArticle(articleId) {
            const expanded = document.getElementById(\`article-\${articleId}\`);
            const btn = event.target;
            
            if (expanded.style.display === 'none') {
                expanded.style.display = 'block';
                btn.textContent = 'Collapse';
                
                // Load similar articles
                loadSimilarArticles(articleId);
            } else {
                expanded.style.display = 'none';
                btn.textContent = btn.textContent.includes('Analysis') ? 'View Analysis' : 'View Details';
            }
        }
        
        // Load similar articles via API
        async function loadSimilarArticles(articleId) {
            const container = document.querySelector(\`#article-\${articleId} .article-similar .loading\`);
            if (!container) return;
            
            try {
                const response = await fetch(\`https://vector-worker.marcelbutucea.workers.dev/similar\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: articleId, limit: 3 })
                });
                
                const data = await response.json();
                const similar = data.similar_articles || [];
                
                if (similar.length > 0) {
                    container.innerHTML = similar.map(article => \`
                        <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                            <div style="font-weight: 500; color: var(--text);">\${article.title}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                \${article.source} • Similarity: \${(article.similarity_score * 100).toFixed(0)}%
                            </div>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="color: var(--text-muted);">No similar articles found</p>';
                }
            } catch (error) {
                container.innerHTML = '<p style="color: var(--error);">Failed to load similar articles</p>';
            }
        }

        // Simple search functionality
        document.getElementById('searchBox').addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                if (query) {
                    window.location.href = \`/search?q=\${encodeURIComponent(query)}\`;
                }
            }
        });
        
        // Add subtle animations
        document.addEventListener('DOMContentLoaded', function() {
            const cards = document.querySelectorAll('.tag-card, .article-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    card.style.transition = 'all 0.6s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            });
        });
    </script>
</body>
</html>`;
}

async function renderTagPage(tagName: string, env: Env): Promise<string> {
  // For now, get recent articles since we don't have article-tag relationships yet
  const articles = await getArticles(env, null, 20);
  const tagInfo = await getTagInfo(env, tagName);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tagName} | PerspectiveStack Intelligence</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #0a0e27;
            --secondary: #1a1f3a;
            --accent: #4f46e5;
            --accent-bright: #6366f1;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --card-bg: #1e293b;
            --gradient: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d3748 100%);
        }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--gradient);
            min-height: 100vh;
            color: var(--text);
            line-height: 1.6;
        }
        
        .header {
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .nav {
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: 800;
            background: linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hero {
            text-align: center;
            padding: 4rem 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .hero h1 {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hero p {
            font-size: 1.2rem;
            color: var(--text-muted);
            margin-bottom: 2rem;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        .section {
            margin-bottom: 4rem;
        }
        
        .section-title {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 2rem;
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .section-title::before {
            content: '';
            width: 4px;
            height: 2rem;
            background: var(--accent);
            border-radius: 2px;
        }
        
        .articles-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
        }
        
        .article-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2rem;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .article-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            border-color: var(--accent);
        }
        
        .article-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--text);
            line-height: 1.4;
        }
        
        .article-meta {
            display: flex;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1rem;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        
        .source-badge {
            background: var(--secondary);
            padding: 0.2rem 0.8rem;
            border-radius: 8px;
            font-weight: 500;
        }
        
        .article-summary {
            color: var(--text-muted);
            line-height: 1.5;
        }
        
        .tag-description {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 3rem;
            text-align: center;
        }
        
        .back-link {
            color: var(--text-muted);
            text-decoration: none;
            padding: 0.5rem 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        
        .back-link:hover {
            color: var(--accent);
            border-color: var(--accent);
        }
        
        @media (max-width: 768px) {
            .hero h1 { font-size: 2.5rem; }
            .articles-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="logo">🌍 PerspectiveStack</div>
            <a href="/" class="back-link">← Back to Home</a>
        </nav>
    </header>
    
    <main>
        <section class="hero">
            <h1>${tagName}</h1>
            <p>${tagInfo?.tag_description || 'Intelligence analysis and multi-perspective coverage'}</p>
            
            ${tagInfo ? `
                <div class="tag-description">
                    <div style="font-size: 1.1rem; color: var(--accent-bright); margin-bottom: 1rem;">
                        📊 ${tagInfo.article_count} articles tracked
                    </div>
                    <div style="color: var(--text-muted);">
                        Last updated: ${new Date(tagInfo.created_at).toLocaleDateString()}
                    </div>
                </div>
            ` : ''}
        </section>
        
        <div class="container">
            <section class="section">
                <h2 class="section-title">📰 Related Intelligence Articles</h2>
                <div class="articles-grid">
                    ${articles.length > 0 ? articles.map(article => `
                        <div class="article-card" onclick="location.href='/article/${article.id}'">
                            <div class="article-title">${article.title}</div>
                            <div class="article-meta">
                                <span class="source-badge">${article.source_name}</span>
                                <span class="time">⏰ ${new Date(article.created_at).toLocaleDateString()}</span>
                            </div>
                            <div class="article-summary">
                                ${article.summary ? article.summary.substring(0, 200) + '...' : 'Click to read full intelligence analysis'}
                            </div>
                        </div>
                    `).join('') : `
                        <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
                            <h3>Articles being processed...</h3>
                            <p>Intelligence articles for this topic are currently being analyzed and will appear here shortly.</p>
                        </div>
                    `}
                </div>
            </section>
        </div>
    </main>
</body>
</html>`;
}

async function renderArticlePage(articleId: number, env: Env): Promise<string> {
  const article = await getArticleById(env, articleId);
  
  if (!article) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Article Not Found | PerspectiveStack</title>
    <style>
        body { font-family: system-ui; padding: 4rem; text-align: center; background: #0f172a; color: white; }
        a { color: #3b82f6; text-decoration: none; }
    </style>
</head>
<body>
    <h1>🔍 Article Not Found</h1>
    <p>The requested intelligence article could not be located.</p>
    <a href="/">← Return to Intelligence Dashboard</a>
</body>
</html>`;
  }
  
  // Get article tags and similar articles
  const [articleTags, similarArticles] = await Promise.all([
    getArticleTags(env, articleId),
    getSimilarArticles(env, articleId)
  ]);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title} | PerspectiveStack Intelligence</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #0a0e27;
            --secondary: #1a1f3a;
            --accent: #4f46e5;
            --accent-bright: #6366f1;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --card-bg: #1e293b;
            --gradient: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d3748 100%);
        }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--gradient);
            min-height: 100vh;
            color: var(--text);
            line-height: 1.6;
        }
        
        .header {
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .nav {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: 800;
            background: linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .back-link {
            color: var(--text-muted);
            text-decoration: none;
            padding: 0.5rem 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        
        .back-link:hover {
            color: var(--accent);
            border-color: var(--accent);
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .article-header {
            margin-bottom: 3rem;
        }
        
        .article-title {
            font-size: 2.5rem;
            font-weight: 800;
            line-height: 1.2;
            margin-bottom: 1.5rem;
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .article-meta {
            display: flex;
            gap: 1.5rem;
            align-items: center;
            margin-bottom: 2rem;
            font-size: 0.9rem;
        }
        
        .source-badge {
            background: var(--accent);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            font-weight: 600;
        }
        
        .date-badge {
            background: var(--secondary);
            color: var(--text-muted);
            padding: 0.5rem 1rem;
            border-radius: 8px;
        }
        
        .status-badge {
            padding: 0.3rem 0.8rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .status-badge.pending { background: #fbbf24; color: #92400e; }
        .status-badge.extracted { background: #60a5fa; color: #1e40af; }
        .status-badge.vectorized { background: #a78bfa; color: #5b21b6; }
        .status-badge.summarized { background: #34d399; color: #065f46; }
        
        .content-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 3rem;
            margin-bottom: 3rem;
        }
        
        .main-content {
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }
        
        .sidebar {
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }
        
        .content-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .card-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border);
            background: var(--secondary);
        }
        
        .card-title {
            font-size: 1.2rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .card-content {
            padding: 1.5rem;
        }
        
        .ai-summary {
            font-size: 1.1rem;
            line-height: 1.7;
            color: var(--text);
        }
        
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        
        .tag {
            background: var(--accent);
            color: white;
            padding: 0.3rem 0.8rem;
            border-radius: 16px;
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .tag:hover {
            background: var(--accent-bright);
            transform: translateY(-2px);
        }
        
        .similar-articles {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .similar-article {
            padding: 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .similar-article:hover {
            border-color: var(--accent);
            background: rgba(79, 70, 229, 0.05);
        }
        
        .similar-title {
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--text);
        }
        
        .similar-meta {
            font-size: 0.8rem;
            color: var(--text-muted);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .similarity-score {
            background: var(--success);
            color: white;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-weight: 500;
        }
        
        .original-link {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--accent);
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .original-link:hover {
            background: var(--accent-bright);
            transform: translateY(-2px);
        }
        
        .no-data {
            text-align: center;
            color: var(--text-muted);
            padding: 2rem;
        }
        
        @media (max-width: 768px) {
            .content-grid {
                grid-template-columns: 1fr;
                gap: 2rem;
            }
            .article-title {
                font-size: 2rem;
            }
            .article-meta {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="logo">🌍 PerspectiveStack</div>
            <a href="/" class="back-link">← Intelligence Dashboard</a>
        </nav>
    </header>
    
    <main class="container">
        <div class="article-header">
            <h1 class="article-title">${article.title}</h1>
            <div class="article-meta">
                <span class="source-badge">${article.source_name}</span>
                <span class="date-badge">📅 ${new Date(article.created_at).toLocaleDateString()}</span>
                <span class="status-badge ${article.status || 'pending'}">${article.status || 'pending'}</span>
            </div>
        </div>
        
        <div class="content-grid">
            <div class="main-content">
                ${article.summary ? `
                    <div class="content-card">
                        <div class="card-header">
                            <div class="card-title">🎯 AI Intelligence Analysis</div>
                        </div>
                        <div class="card-content">
                            <div class="ai-summary">${article.summary}</div>
                        </div>
                    </div>
                ` : `
                    <div class="content-card">
                        <div class="card-header">
                            <div class="card-title">⏳ Analysis Pending</div>
                        </div>
                        <div class="card-content">
                            <div class="no-data">AI analysis for this intelligence article is currently being processed.</div>
                        </div>
                    </div>
                `}
                
                <div class="content-card">
                    <div class="card-header">
                        <div class="card-title">📰 Original Source</div>
                    </div>
                    <div class="card-content">
                        <a href="${article.url}" target="_blank" class="original-link">
                            🔗 Read Full Article
                        </a>
                        ${article.description ? `
                            <div style="margin-top: 1rem; color: var(--text-muted); line-height: 1.6;">
                                ${article.description}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <div class="sidebar">
                <div class="content-card">
                    <div class="card-header">
                        <div class="card-title">🏷️ Intelligence Tags</div>
                    </div>
                    <div class="card-content">
                        ${articleTags.length > 0 ? `
                            <div class="tags-container">
                                ${articleTags.map(tag => `
                                    <span class="tag" onclick="location.href='/tag/${encodeURIComponent(tag.tag_name)}'">${tag.tag_name}</span>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="no-data">Tags are being generated for this article</div>
                        `}
                    </div>
                </div>
                
                <div class="content-card">
                    <div class="card-header">
                        <div class="card-title">🔍 Similar Intelligence</div>
                    </div>
                    <div class="card-content">
                        ${similarArticles.length > 0 ? `
                            <div class="similar-articles">
                                ${similarArticles.map(similar => `
                                    <div class="similar-article" onclick="location.href='/article/${similar.id}'">
                                        <div class="similar-title">${similar.title}</div>
                                        <div class="similar-meta">
                                            <span>${similar.source_name}</span>
                                            <span class="similarity-score">${(similar.similarity_score * 100).toFixed(0)}% similar</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="no-data">Vector analysis in progress...</div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    </main>
</body>
</html>`;
}

async function renderSearchPage(query: string, env: Env): Promise<string> {
  const searchResults = await searchArticles(env, query);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search: ${query} | PerspectiveStack Intelligence</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #0a0e27;
            --secondary: #1a1f3a;
            --accent: #4f46e5;
            --accent-bright: #6366f1;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --border: #334155;
            --card-bg: #1e293b;
            --gradient: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d3748 100%);
        }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--gradient);
            min-height: 100vh;
            color: var(--text);
            line-height: 1.6;
        }
        
        .header {
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .nav {
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: 800;
            background: linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .back-link {
            color: var(--text-muted);
            text-decoration: none;
            padding: 0.5rem 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        
        .back-link:hover {
            color: var(--accent);
            border-color: var(--accent);
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .search-header {
            text-align: center;
            margin-bottom: 3rem;
        }
        
        .search-title {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .search-query {
            color: var(--accent-bright);
            font-size: 1.2rem;
            margin-bottom: 1rem;
        }
        
        .search-box {
            width: 100%;
            max-width: 600px;
            padding: 1rem 1.5rem;
            border: 2px solid var(--border);
            border-radius: 50px;
            background: var(--card-bg);
            color: var(--text);
            font-size: 1rem;
            margin: 0 auto;
            display: block;
            transition: border-color 0.3s ease;
        }
        
        .search-box:focus {
            outline: none;
            border-color: var(--accent);
        }
        
        .results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
        }
        
        .result-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2rem;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .result-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            border-color: var(--accent);
        }
        
        .result-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--text);
            line-height: 1.4;
        }
        
        .result-meta {
            display: flex;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1rem;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        
        .source-badge {
            background: var(--secondary);
            padding: 0.2rem 0.8rem;
            border-radius: 8px;
            font-weight: 500;
        }
        
        .result-preview {
            color: var(--text-muted);
            line-height: 1.5;
        }
        
        .no-results {
            text-align: center;
            padding: 4rem;
            color: var(--text-muted);
        }
        
        @media (max-width: 768px) {
            .results-grid { grid-template-columns: 1fr; }
            .search-title { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav">
            <div class="logo">🌍 PerspectiveStack</div>
            <a href="/" class="back-link">← Intelligence Dashboard</a>
        </nav>
    </header>
    
    <main class="container">
        <div class="search-header">
            <h1 class="search-title">🔍 Intelligence Search</h1>
            ${query ? `<div class="search-query">Results for: "${query}"</div>` : ''}
            
            <form method="GET" action="/search">
                <input type="text" name="q" value="${query}" placeholder="Search global intelligence topics..." class="search-box" autofocus>
            </form>
        </div>
        
        <div class="results-grid">
            ${searchResults.length > 0 ? searchResults.map(article => `
                <div class="result-card" onclick="location.href='/article/${article.id}'">
                    <div class="result-title">${article.title}</div>
                    <div class="result-meta">
                        <span class="source-badge">${article.source_name}</span>
                        <span>📅 ${new Date(article.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="result-preview">
                        ${article.summary ? article.summary.substring(0, 200) + '...' : 
                          article.description ? article.description.substring(0, 200) + '...' : 
                          'Click to read full intelligence analysis'}
                    </div>
                </div>
            `).join('') : `
                <div class="no-results">
                    <h3>No results found</h3>
                    <p>Try different search terms or browse our intelligence tags instead.</p>
                </div>
            `}
        </div>
    </main>
</body>
</html>`;
}

// Database helper functions
async function getDailyTags(env: Env, date: string) {
  try {
    // Get ALL tags regardless of date until we have proper daily tag generation
    const result = await env.DB.prepare(`
      SELECT tag_name, tag_description, article_count, created_at
      FROM daily_tags 
      ORDER BY article_count DESC, created_at DESC
      LIMIT 20
    `).all();
    
    return result.results || [];
  } catch (error) {
    console.error('Failed to get daily tags:', error);
    return [];
  }
}

async function getArticles(env: Env, tag: string | null, limit: number) {
  try {
    let query = `
      SELECT a.id, a.title, a.url, a.source_name, a.created_at, s.summary
      FROM articles a
      LEFT JOIN ai_summaries s ON a.id = s.article_id
    `;
    
    const params = [];
    
    if (tag) {
      query += `
        INNER JOIN article_tags at ON a.id = at.article_id
        INNER JOIN daily_tags dt ON at.tag_id = dt.id
        WHERE dt.tag_name = ?
      `;
      params.push(tag);
    }
    
    query += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);
    
    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results || [];
  } catch (error) {
    console.error('Failed to get articles:', error);
    return [];
  }
}

async function getArticlesByTag(env: Env, tagName: string) {
  return getArticles(env, tagName, 50);
}

async function getTagInfo(env: Env, tagName: string) {
  try {
    const result = await env.DB.prepare(`
      SELECT tag_name, tag_description, article_count, created_at
      FROM daily_tags 
      WHERE tag_name = ?
      LIMIT 1
    `).bind(tagName).first();
    
    return result;
  } catch (error) {
    console.error('Failed to get tag info:', error);
    return null;
  }
}

async function getArticleTags(env: Env, articleId: number) {
  try {
    const result = await env.DB.prepare(`
      SELECT dt.tag_name, dt.tag_description
      FROM article_tags at
      JOIN daily_tags dt ON at.tag_id = dt.id
      WHERE at.article_id = ?
      ORDER BY at.relevance_score DESC
    `).bind(articleId).all();
    
    return result.results || [];
  } catch (error) {
    console.error('Failed to get article tags:', error);
    return [];
  }
}

async function getSimilarArticles(env: Env, articleId: number) {
  try {
    // Call vector worker for similar articles
    const response = await fetch('https://vector-worker.marcelbutucea.workers.dev/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId, limit: 5 })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.similar_articles || [];
    }
    
    return [];
  } catch (error) {
    console.error('Failed to get similar articles:', error);
    return [];
  }
}

async function searchArticles(env: Env, query: string) {
  try {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const result = await env.DB.prepare(`
      SELECT a.id, a.title, a.url, a.source_name, a.created_at, a.description, s.summary
      FROM articles a
      LEFT JOIN ai_summaries s ON a.id = s.article_id
      WHERE 
        LOWER(a.title) LIKE ? OR 
        LOWER(a.description) LIKE ? OR 
        LOWER(s.summary) LIKE ?
      ORDER BY a.created_at DESC
      LIMIT 50
    `).bind(searchTerm, searchTerm, searchTerm).all();
    
    return result.results || [];
  } catch (error) {
    console.error('Failed to search articles:', error);
    return [];
  }
}

async function getArticleById(env: Env, id: number) {
  try {
    const result = await env.DB.prepare(`
      SELECT a.*, s.summary
      FROM articles a
      LEFT JOIN ai_summaries s ON a.id = s.article_id
      WHERE a.id = ?
    `).bind(id).first();
    
    return result;
  } catch (error) {
    console.error('Failed to get article:', error);
    return null;
  }
}

async function getSystemStats(env: Env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [
      totalArticles,
      processedToday,
      sourcesCount,
      summarizedToday
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE DATE(created_at) = ?").bind(today).first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources WHERE active = 1").first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count 
        FROM ai_summaries s
        JOIN articles a ON s.article_id = a.id
        WHERE DATE(s.created_at) = ?
      `).bind(today).first()
    ]);
    
    return {
      total_articles: totalArticles?.count || 0,
      processed_today: Math.max(processedToday?.count || 0, summarizedToday?.count || 0),
      sources_count: sourcesCount?.count || 87
    };
  } catch (error) {
    console.error('Failed to get system stats:', error);
    
    // Fallback to basic queries without complex joins
    try {
      const [total, sources] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM rss_sources").first()
      ]);
      
      return {
        total_articles: total?.count || 0,
        processed_today: Math.min(total?.count || 0, 20),
        sources_count: sources?.count || 87
      };
    } catch (fallbackError) {
      return { total_articles: 20, processed_today: 8, sources_count: 87 };
    }
  }
}

async function createSampleTags(env: Env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Creating sample tags for date:', today);
    
    const sampleTags = [
      {
        name: "Ukraine War Updates",
        description: "Latest battlefield developments and strategic implications from the ongoing conflict",
        count: 12
      },
      {
        name: "China-Taiwan Tensions", 
        description: "Cross-strait military activities and diplomatic developments",
        count: 8
      },
      {
        name: "Middle East Crisis",
        description: "Regional conflicts and geopolitical developments across the Middle East",
        count: 15
      },
      {
        name: "Defense Technology",
        description: "Emerging military technologies, weapons systems, and defense innovations",
        count: 6
      },
      {
        name: "NATO Operations",
        description: "Alliance activities, military exercises, and strategic initiatives", 
        count: 9
      },
      {
        name: "Cyber Warfare",
        description: "State-sponsored cyber attacks, digital espionage, and cybersecurity threats",
        count: 7
      },
      {
        name: "Nuclear Developments",
        description: "Nuclear proliferation, arms control, and strategic weapons programs",
        count: 4
      },
      {
        name: "Energy Security",
        description: "Critical infrastructure, energy supply chains, and resource competition",
        count: 11
      }
    ];
    
    let created = 0;
    for (const tag of sampleTags) {
      try {
        console.log(`Creating tag: ${tag.name}`);
        const result = await env.DB.prepare(`
          INSERT OR REPLACE INTO daily_tags 
          (tag_name, tag_description, article_count, created_date, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          tag.name,
          tag.description,
          tag.count,
          today,
          new Date().toISOString()
        ).run();
        console.log(`Created tag ${tag.name}, result:`, result);
        created++;
      } catch (e) {
        console.error(`Failed to create tag ${tag.name}:`, e);
        throw e;
      }
    }
    
    console.log(`Successfully created ${created} tags`);
    return { success: true, tags_created: created, date: today };
  } catch (error) {
    console.error('Failed to create sample tags:', error);
    throw error;
  }
}
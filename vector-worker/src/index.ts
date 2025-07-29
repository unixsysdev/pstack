interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: any;
}

interface VectorizeRequest {
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
          worker_type: 'vectorize',
          
          limit: 3
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
          status: 'Vector Worker operational - Embeddings only',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/process' && request.method === 'POST') {
        const worker = new QueueWorker(env);
        const jobs = await worker.pollJobs();
        
        let processed = 0;
        for (const job of jobs) {
          try {
            await vectorizeContent(job.payload, env);
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
            SELECT id, title, status FROM articles 
            WHERE (status = 'extracted' OR status = 'summarized')
            AND status NOT LIKE '%vectorized%'
            ORDER BY created_at DESC 
            LIMIT 3
          `).all();
          
          console.log(`📰 Found ${articles.results?.length || 0} extracted articles to vectorize`);
          
          for (const article of (articles.results || [])) {
            try {
              console.log(`🧠 Processing article ${article.id}: ${article.title}`);
              await vectorizeContent({
                article_id: article.id,
                content_key: `content/article_${article.id}.json`
              }, env);
              processed++;
              console.log(`✅ Article ${article.id} vectorized successfully`);
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

      if (url.pathname === '/vectorize' && request.method === 'POST') {
        const payload = await request.json();
        await vectorizeContent(payload, env);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname === '/search' && request.method === 'POST') {
        const { query, limit = 5 } = await request.json();
        const results = await searchSimilar(query, limit, env);
        return Response.json({ results }, { headers: corsHeaders });
      }

      if (url.pathname === '/similar' && request.method === 'POST') {
        const { article_id, limit = 10 } = await request.json();
        const results = await findSimilarArticles(article_id, limit, env);
        return Response.json({ similar_articles: results }, { headers: corsHeaders });
      }

      if (url.pathname === '/cluster-topics' && request.method === 'POST') {
        const { date, threshold = 0.8 } = await request.json();
        const clusters = await clusterArticlesByTopic(date || new Date().toISOString().split('T')[0], threshold, env);
        return Response.json({ clusters }, { headers: corsHeaders });
      }

      if (url.pathname === '/stats') {
        const stats = await getVectorStats(env);
        return Response.json(stats, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'Vector Worker - Embeddings Only',
        endpoints: {
          'POST /process': 'Process vectorization jobs from queue',
          'POST /vectorize': 'Vectorize single article', 
          'POST /search': 'Search similar content',
          'GET /stats': 'Get vectorization statistics',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('Vector Worker error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🕒 Processing vectorization jobs...');
    const worker = new QueueWorker(env);
    const jobs = await worker.pollJobs();
    
    for (const job of jobs) {
      try {
        await vectorizeContent(job.payload, env);
        await worker.completeJob(job.id);
      } catch (error) {
        await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
};

async function vectorizeContent(req: VectorizeRequest, env: Env): Promise<void> {
  try {
    console.log(`🔍 Vectorizing article ${req.article_id} from ${req.content_key}`);
    
    // Check if already vectorized
    const existing = await env.DB.prepare(
      'SELECT status FROM articles WHERE id = ?'
    ).bind(req.article_id).first();
    
    if (!existing) {
      console.error(`❌ Article ${req.article_id} not found`);
      return;
    }
    
    if (existing.status && existing.status.includes('vectorized')) {
      console.log(`✅ Article ${req.article_id} already vectorized`);
      return;
    }

    // Update status
    await env.DB.prepare(
      'UPDATE articles SET status = ?, updated_at = ? WHERE id = ?'
    ).bind('vectorizing', new Date().toISOString(), req.article_id).run();
    
    // Get content from R2
    const contentObj = await env.CONTENT_BUCKET.get(req.content_key);
    if (!contentObj) {
      throw new Error(`Content not found: ${req.content_key}`);
    }
    
    const contentData = JSON.parse(await contentObj.text());
    const content = contentData.content;
    
    if (!content || content.length < 100) {
      throw new Error(`Content too short: ${content?.length || 0} chars`);
    }
    
    // Chunk content intelligently
    const chunks = intelligentChunk(content, req.article_id);
    console.log(`📄 Created ${chunks.length} chunks for article ${req.article_id}`);
    
    // Generate embeddings using Cloudflare AI
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
          text: chunks[i]
        });
        
        if (embedding && embedding.data && Array.isArray(embedding.data[0])) {
          vectors.push({
            id: `${req.article_id}_chunk_${i}`,
            values: embedding.data[0],
            metadata: {
              article_id: req.article_id,
              chunk_index: i,
              content: chunks[i].substring(0, 200),
              title: contentData.title || '',
              source_name: contentData.source_name || '',
              category: getCategory(content)
            }
          });
        }
      } catch (embeddingError) {
        console.error(`❌ Failed to generate embedding for chunk ${i}:`, embeddingError);
      }
    }
    
    if (vectors.length === 0) {
      throw new Error('No embeddings generated successfully');
    }
    
    // Store vectors in Vectorize
    try {
      const vectorResult = await env.VECTORIZE_INDEX.upsert(vectors);
      console.log(`✅ Stored ${vectors.length} vectors in Vectorize`);
      
      // Store metadata in database
      for (const vector of vectors) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO vector_embeddings 
          (article_id, chunk_index, embedding_id, content_chunk, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          req.article_id,
          vector.metadata.chunk_index,
          vector.id,
          vector.metadata.content,
          new Date().toISOString()
        ).run();
      }
      
    } catch (vectorError) {
      console.error('❌ Failed to store vectors:', vectorError);
      throw new Error(`Vector storage failed: ${vectorError.message}`);
    }
    
    // Update article status
    await env.DB.prepare(`
      UPDATE articles SET 
        status = 'vectorized',
        updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), req.article_id).run();
    
    // Queue AI summarization job
    console.log(`🚀 Queuing AI summarization for article ${req.article_id}`);
    await fetch("https://queue-manager.marcelbutucea.workers.dev/jobs", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "summarize",
        payload: {
          article_id: req.article_id,
          content_key: req.content_key
        },
        priority: 3
      })
    });
    
    console.log(`✅ Article ${req.article_id} vectorized: ${chunks.length} chunks, ${vectors.length} vectors`);
    
  } catch (error) {
    console.error('❌ Vectorization failed:', error);
    await env.DB.prepare(
      'UPDATE articles SET status = ?, updated_at = ? WHERE id = ?'
    ).bind(
      'vectorization_failed',
      new Date().toISOString(),
      req.article_id
    ).run();
    throw error;
  }
}

function intelligentChunk(content: string, articleId: number): string[] {
  const chunks: string[] = [];
  const maxChunkSize = 500;
  const overlap = 50;
  
  // Split by sentences first
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence + '. ';
    
    if (testChunk.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap
      currentChunk = currentChunk.substring(currentChunk.length - overlap) + sentence + '. ';
    } else {
      currentChunk = testChunk;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 50);
}

function getCategory(content: string): string {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('military') || lowerContent.includes('defense') || lowerContent.includes('weapon')) {
    return 'defense';
  } else if (lowerContent.includes('economic') || lowerContent.includes('trade') || lowerContent.includes('market')) {
    return 'economic';
  } else if (lowerContent.includes('diplomatic') || lowerContent.includes('treaty') || lowerContent.includes('negotiation')) {
    return 'diplomatic';
  } else if (lowerContent.includes('conflict') || lowerContent.includes('war') || lowerContent.includes('violence')) {
    return 'conflict';
  } else {
    return 'general';
  }
}

async function searchSimilar(query: string, limit: number, env: Env): Promise<any[]> {
  try {
    // Generate embedding for query using same model as vectorization
    const queryEmbedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: query
    });
    
    if (!queryEmbedding || !queryEmbedding.data || !Array.isArray(queryEmbedding.data[0])) {
      return [];
    }
    
    // Search similar vectors
    const results = await env.VECTORIZE_INDEX.query(queryEmbedding.data[0], {
      topK: limit,
      includeMetadata: true
    });
    
    return results.matches.map(match => ({
      article_id: match.metadata.article_id,
      title: match.metadata.title,
      content_preview: match.metadata.content,
      source: match.metadata.source_name,
      category: match.metadata.category,
      similarity_score: match.score
    }));
    
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

async function findSimilarArticles(articleId: number, limit: number, env: Env): Promise<any[]> {
  try {
    // Get the article's title to search with
    const article = await env.DB.prepare(
      'SELECT title, content FROM articles WHERE id = ?'
    ).bind(articleId).first();
    
    if (!article) {
      return [];
    }
    
    // Use title + partial content for similarity search
    const searchText = `${article.title} ${(article.content || '').substring(0, 500)}`;
    
    // Generate embedding for the article content using same model as vectorization
    const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: searchText
    });
    
    if (!embedding || !embedding.data || !Array.isArray(embedding.data[0])) {
      return [];
    }
    
    // Search for similar vectors
    const results = await env.VECTORIZE_INDEX.query(embedding.data[0], {
      topK: limit + 5, // Get extra to filter out the same article
      includeMetadata: true
    });
    
    // Filter out the same article and return similar ones
    return results.matches
      .filter(match => match.metadata.article_id !== articleId)
      .slice(0, limit)
      .map(match => ({
        article_id: match.metadata.article_id,
        title: match.metadata.title,
        source: match.metadata.source_name,
        similarity_score: match.score,
        content_preview: match.metadata.content?.substring(0, 150) + '...'
      }));
      
  } catch (error) {
    console.error('Similar articles search failed:', error);
    return [];
  }
}

async function clusterArticlesByTopic(date: string, threshold: number, env: Env): Promise<any[]> {
  try {
    // Get articles from the specified date with embeddings
    const articles = await env.DB.prepare(`
      SELECT DISTINCT a.id, a.title, a.source_name, ve.embedding_id
      FROM articles a
      INNER JOIN vector_embeddings ve ON a.id = ve.article_id
      WHERE DATE(a.created_at) = ?
      ORDER BY a.created_at DESC
      LIMIT 50
    `).bind(date).all();
    
    if (!articles.results || articles.results.length < 2) {
      return [];
    }
    
    const clusters = [];
    const processed = new Set();
    
    // Simple clustering algorithm
    for (const article of articles.results) {
      if (processed.has(article.id)) continue;
      
      const cluster = {
        topic: `Topic-${clusters.length + 1}`,
        articles: [article],
        similarity_threshold: threshold
      };
      
      // Find similar articles using vector search
      const similar = await findSimilarArticles(article.id, 10, env);
      
      for (const sim of similar) {
        if (sim.similarity_score >= threshold && !processed.has(sim.article_id)) {
          cluster.articles.push({
            id: sim.article_id,
            title: sim.title,
            source_name: sim.source
          });
          processed.add(sim.article_id);
        }
      }
      
      processed.add(article.id);
      
      // Only keep clusters with multiple articles
      if (cluster.articles.length > 1) {
        // Generate a better topic name based on common themes
        cluster.topic = await generateClusterTopic(cluster.articles, env);
        clusters.push(cluster);
      }
    }
    
    return clusters;
    
  } catch (error) {
    console.error('Topic clustering failed:', error);
    return [];
  }
}

async function generateClusterTopic(articles: any[], env: Env): Promise<string> {
  try {
    const titles = articles.map(a => a.title).join(' | ');
    
    // Use AI to generate a topic name using same model as vectorization
    const topicEmbedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: titles
    });
    
    // Simple heuristic topic generation
    const commonWords = extractCommonKeywords(titles);
    if (commonWords.length > 0) {
      return commonWords.slice(0, 3).join(' ').toUpperCase();
    }
    
    return `Topic-${Date.now()}`;
    
  } catch (error) {
    return `Cluster-${Date.now()}`;
  }
}

function extractCommonKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
    
  const frequency: { [key: string]: number } = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  return Object.entries(frequency)
    .filter(([word, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

async function getVectorStats(env: Env): Promise<any> {
  try {
    const [totalVectors, totalArticles, vectorizedArticles, vectorizedToday] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM vector_embeddings").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%vectorized%'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status LIKE '%vectorized%' AND DATE(created_at) = DATE('now')").first()
    ]);
    
    return {
      total_vectors: totalVectors?.count || 0,
      total_articles: totalArticles?.count || 0,
      vectorized_articles: vectorizedArticles?.count || 0,
      vectorized_today: vectorizedToday?.count || 0,
      vectorization_rate: totalArticles?.count > 0 ? 
        ((vectorizedArticles?.count || 0) / totalArticles.count * 100).toFixed(1) + '%' : '0%'
    };
  } catch (error) {
    return { error: error.message };
  }
}
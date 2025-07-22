interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  VECTORIZE_INDEX: VectorizeIndex;
}

interface VectorizeRequest {
  article_id: number;
  content_key: string;
  analysis_key: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/vectorize' && request.method === 'POST') {
      try {
        const body: VectorizeRequest = await request.json();
        ctx.waitUntil(vectorizeContent(body, env));
        return new Response('Vectorization initiated', { status: 200 });
      } catch (error) {
        console.error('Vectorization error:', error);
        return new Response('Vectorization failed', { status: 500 });
      }
    }
    
    if (url.pathname === '/search' && request.method === 'POST') {
      try {
        const body: { query: string; limit?: number } = await request.json();
        const results = await searchSimilar(body.query, body.limit || 10, env);
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Search error:', error);
        return new Response('Search failed', { status: 500 });
      }
    }
    
    return new Response('Vector Worker', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

async function vectorizeContent(req: VectorizeRequest, env: Env): Promise<void> {
  try {
    // Get content from R2
    const contentObj = await env.CONTENT_BUCKET.get(req.content_key);
    if (!contentObj) {
      console.error('Content not found:', req.content_key);
      return;
    }
    
    const contentData = await contentObj.json() as any;
    const content = contentData.content;
    
    // Get analysis from R2  
    const analysisObj = await env.CONTENT_BUCKET.get(req.analysis_key);
    let analysisData: any = null;
    if (analysisObj) {
      analysisData = await analysisObj.json();
    }
    
    // Split content into chunks for vectorization
    const chunks = chunkText(content, 500); // 500 word chunks
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Prepare metadata for the vector
      const metadata = {
        article_id: req.article_id,
        chunk_index: i,
        total_chunks: chunks.length,
        title: contentData.title || '',
        source: contentData.source_name || '',
        url: contentData.url || '',
        published_at: contentData.extracted_at || '',
        category: 'geopolitical',
        word_count: chunk.split(' ').length
      };
      
      // Add analysis metadata if available
      if (analysisData && analysisData.analysis) {
        metadata.sentiment = analysisData.analysis.sentiment;
        metadata.summary = analysisData.analysis.summary?.substring(0, 200);
      }
      
      // Insert into Vectorize
      const vectorId = `article_${req.article_id}_chunk_${i}`;
      
      await env.VECTORIZE_INDEX.upsert([
        {
          id: vectorId,
          values: [], // Vectorize will generate embeddings automatically
          metadata: metadata
        }
      ]);
      
      // Store in DB for tracking
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vector_embeddings (
          article_id, chunk_index, embedding_id, content_chunk, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        req.article_id,
        i,
        vectorId,
        chunk,
        new Date().toISOString()
      ).run();
    }
    
    console.log(`Vectorized ${chunks.length} chunks for article ${req.article_id}`);
  } catch (error) {
    console.error('Vectorization failed:', error);
  }
}

function chunkText(text: string, maxWords: number = 500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    if (chunk.trim().length > 50) { // Only include meaningful chunks
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

async function searchSimilar(query: string, limit: number, env: Env): Promise<any> {
  try {
    // Perform similarity search
    const results = await env.VECTORIZE_INDEX.query({
      vector: [], // Vectorize will embed the query automatically
      topK: limit,
      returnValues: false,
      returnMetadata: 'all'
    });
    
    // Enrich results with article data
    const enrichedResults = [];
    
    for (const match of results.matches || []) {
      const articleId = match.metadata?.article_id;
      if (articleId) {
        const article = await env.DB.prepare(
          'SELECT * FROM articles WHERE id = ?'
        ).bind(articleId).first();
        
        const analysis = await env.DB.prepare(
          'SELECT summary, sentiment FROM ai_analyses WHERE article_id = ?'
        ).bind(articleId).first();
        
        enrichedResults.push({
          score: match.score,
          article: article,
          analysis: analysis,
          chunk_metadata: match.metadata
        });
      }
    }
    
    return {
      query,
      total_results: enrichedResults.length,
      results: enrichedResults
    };
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}
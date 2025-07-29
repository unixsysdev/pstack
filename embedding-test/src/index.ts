interface Env {
  VECTORIZE_INDEX: VectorizeIndex;
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/test-embedding') {
      return await testEmbedding(env);
    }
    
    if (url.pathname === '/test-vectorize') {
      return await testVectorize(env);
    }
    
    return new Response(`
      Embedding Test Worker
      
      Endpoints:
      - GET /test-embedding - Test AI embedding generation
      - GET /test-vectorize - Test full vectorization pipeline
    `);
  }
} satisfies ExportedHandler<Env>;

async function testEmbedding(env: Env): Promise<Response> {
  const testText = "This is a test article about defense technology and artificial intelligence.";
  
  try {
    console.log('🧪 Testing embedding generation...');
    console.log(`Input text: "${testText}"`);
    console.log(`Text length: ${testText.length} chars`);
    
    const start = Date.now();
    const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: testText
    });
    const duration = Date.now() - start;
    
    console.log(`⏱️ Embedding took ${duration}ms`);
    console.log('📊 Embedding result:', {
      hasEmbedding: !!embedding,
      hasData: !!embedding?.data,
      dataType: typeof embedding?.data,
      dataLength: embedding?.data?.length,
      isArray: Array.isArray(embedding?.data),
      firstFew: embedding?.data?.slice(0, 5)
    });
    
    if (!embedding) {
      return new Response(JSON.stringify({
        error: 'No embedding returned',
        duration,
        input: testText
      }, null, 2), { status: 500 });
    }
    
    if (!embedding.data) {
      return new Response(JSON.stringify({
        error: 'No embedding.data returned',
        embedding,
        duration,
        input: testText
      }, null, 2), { status: 500 });
    }
    
    if (embedding.data.length !== 1024) {
      return new Response(JSON.stringify({
        error: `Wrong dimensions: expected 1024, got ${embedding.data.length}`,
        embedding,
        duration,
        input: testText
      }, null, 2), { status: 500 });
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: '✅ Embedding generation successful!',
      duration: `${duration}ms`,
      dimensions: embedding.data.length,
      sample_values: embedding.data.slice(0, 10),
      input: testText
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Embedding failed:', error);
    return new Response(JSON.stringify({
      error: 'Embedding generation failed',
      message: error.message,
      stack: error.stack,
      input: testText
    }, null, 2), { status: 500 });
  }
}

async function testVectorize(env: Env): Promise<Response> {
  const testText = "This is a test article about defense technology and artificial intelligence in modern warfare.";
  
  try {
    console.log('🚀 Testing full vectorization pipeline...');
    
    // Step 1: Generate embedding
    console.log('Step 1: Generating embedding...');
    const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: testText
    });
    
    if (!embedding?.data || embedding.data.length !== 1024) {
      throw new Error(`Invalid embedding: ${embedding?.data?.length} dimensions`);
    }
    
    console.log('✅ Embedding generated successfully');
    
    // Step 2: Test vectorize upsert
    console.log('Step 2: Testing Vectorize upsert...');
    const testVector = {
      id: `test_${Date.now()}`,
      values: embedding.data,
      metadata: {
        test: true,
        text: testText,
        timestamp: new Date().toISOString()
      }
    };
    
    const upsertResult = await env.VECTORIZE_INDEX.upsert([testVector]);
    console.log('✅ Vectorize upsert result:', upsertResult);
    
    // Step 3: Test vectorize query
    console.log('Step 3: Testing Vectorize query...');
    const queryResult = await env.VECTORIZE_INDEX.query({
      vector: embedding.data,
      topK: 5,
      returnValues: false,
      returnMetadata: 'all'
    });
    
    console.log('✅ Vectorize query result:', queryResult);
    
    return new Response(JSON.stringify({
      success: true,
      message: '✅ Full vectorization pipeline successful!',
      steps: {
        embedding: {
          dimensions: embedding.data.length,
          sample: embedding.data.slice(0, 5)
        },
        upsert: upsertResult,
        query: {
          matches: queryResult.matches?.length || 0,
          results: queryResult.matches?.map(m => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata
          }))
        }
      }
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Vectorization failed:', error);
    return new Response(JSON.stringify({
      error: 'Vectorization pipeline failed',
      message: error.message,
      stack: error.stack,
      input: testText
    }, null, 2), { status: 500 });
  }
}

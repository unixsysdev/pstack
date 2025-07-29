interface Env {
  DB: D1Database;
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
          status: 'Pipeline Orchestrator operational',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/run-pipeline' && request.method === 'POST') {
        const { steps = 'all' } = await request.json();
        const result = await runCompletePipeline(env, steps);
        return Response.json(result, { headers: corsHeaders });
      }

      if (url.pathname === '/pipeline-status') {
        const status = await getPipelineStatus(env);
        return Response.json(status, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'Pipeline Orchestrator - PerspectiveStack Intelligence',
        endpoints: {
          'POST /run-pipeline': 'Execute complete pipeline',
          'GET /pipeline-status': 'Get pipeline status',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('Orchestrator error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🚀 Starting automated pipeline execution...');
    await runCompletePipeline(env, 'all');
    console.log('✅ Automated pipeline execution completed');
  }
};

async function runCompletePipeline(env: Env, steps: string): Promise<any> {
  const results = {
    timestamp: new Date().toISOString(),
    steps_executed: [],
    errors: [],
    summary: {}
  };

  try {
    console.log('🚀 STARTING PERSPECTIVESTACK INTELLIGENCE PIPELINE');

    // Step 1: RSS Collection
    if (steps === 'all' || steps.includes('rss')) {
      console.log('📡 Step 1: RSS Collection');
      try {
        const rssResponse = await fetch('https://rss-collector.marcelbutucea.workers.dev/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 20, sourceLimit: 10 })
        });
        const rssResult = await rssResponse.json();
        results.steps_executed.push('rss_collection');
        results.summary.rss_collection = rssResult;
        console.log(`✅ RSS: ${rssResult.stats?.new_articles || 0} new articles`);
        
        // Wait a bit for articles to be saved
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('❌ RSS Collection failed:', error);
        results.errors.push({ step: 'rss_collection', error: error.message });
      }
    }

    // Step 2: Content Extraction
    if (steps === 'all' || steps.includes('extract')) {
      console.log('🔍 Step 2: Content Extraction');
      try {
        // Create extraction jobs for pending articles
        const batchResponse = await fetch('https://content-extractor.marcelbutucea.workers.dev/batch-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 15 })
        });
        const batchResult = await batchResponse.json();
        
        // Process extraction jobs
        const processResponse = await fetch('https://content-extractor.marcelbutucea.workers.dev/process', {
          method: 'POST'
        });
        const processResult = await processResponse.json();
        
        results.steps_executed.push('content_extraction');
        results.summary.content_extraction = {
          jobs_created: batchResult.jobs_created,
          jobs_processed: processResult.processed_jobs
        };
        console.log(`✅ Extraction: ${processResult.processed_jobs} articles processed`);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error('❌ Content Extraction failed:', error);
        results.errors.push({ step: 'content_extraction', error: error.message });
      }
    }

    // Step 3: Vectorization
    if (steps === 'all' || steps.includes('vector')) {
      console.log('🧠 Step 3: Vectorization');
      try {
        const vectorResponse = await fetch('https://vector-worker.marcelbutucea.workers.dev/process', {
          method: 'POST'
        });
        const vectorResult = await vectorResponse.json();
        results.steps_executed.push('vectorization');
        results.summary.vectorization = vectorResult;
        console.log(`✅ Vectorization: ${vectorResult.processed_jobs} articles vectorized`);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('❌ Vectorization failed:', error);
        results.errors.push({ step: 'vectorization', error: error.message });
      }
    }

    // Step 4: AI Summarization
    if (steps === 'all' || steps.includes('summarize')) {
      console.log('📝 Step 4: AI Summarization');
      try {
        const summaryResponse = await fetch('https://ai-summarizer.marcelbutucea.workers.dev/process', {
          method: 'POST'
        });
        const summaryResult = await summaryResponse.json();
        results.steps_executed.push('ai_summarization');
        results.summary.ai_summarization = summaryResult;
        console.log(`✅ Summarization: ${summaryResult.processed_jobs} summaries generated`);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('❌ AI Summarization failed:', error);  
        results.errors.push({ step: 'ai_summarization', error: error.message });
      }
    }

    // Step 5: Tag Generation
    if (steps === 'all' || steps.includes('tags')) {
      console.log('🏷️ Step 5: Tag Generation');
      try {
        const tagResponse = await fetch('https://tag-generator.marcelbutucea.workers.dev/generate-daily-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days_back: 0, force_regenerate: false })
        });
        const tagResult = await tagResponse.json();
        results.steps_executed.push('tag_generation');
        results.summary.tag_generation = tagResult;
        console.log(`✅ Tags: ${tagResult.tags_generated} intelligence tags created`);
      } catch (error) {
        console.error('❌ Tag Generation failed:', error);
        results.errors.push({ step: 'tag_generation', error: error.message });
      }
    }

    // Step 6: Topic Clustering (NEW!)
    if (steps === 'all' || steps.includes('cluster')) {
      console.log('🔗 Step 6: Topic Clustering');
      try {
        const clusterResponse = await fetch('https://vector-worker.marcelbutucea.workers.dev/cluster-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            date: new Date().toISOString().split('T')[0],
            threshold: 0.75 
          })
        });
        const clusterResult = await clusterResponse.json();
        results.steps_executed.push('topic_clustering');
        results.summary.topic_clustering = clusterResult;
        console.log(`✅ Clustering: ${clusterResult.clusters?.length || 0} topic clusters created`);
      } catch (error) {
        console.error('❌ Topic Clustering failed:', error);
        results.errors.push({ step: 'topic_clustering', error: error.message });
      }
    }

    console.log('🎉 PIPELINE EXECUTION COMPLETED!');
    console.log(`📊 Summary: ${results.steps_executed.length} steps executed, ${results.errors.length} errors`);
    
    return results;

  } catch (error) {
    console.error('❌ Pipeline execution failed:', error);
    results.errors.push({ step: 'pipeline', error: error.message });
    return results;
  }
}

async function getPipelineStatus(env: Env): Promise<any> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [
      totalArticles,
      extractedArticles, 
      vectorizedArticles,
      summarizedArticles,
      todaysTags,
      recentJobs
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM articles").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'extracted'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'vectorized'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'summarized'").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM daily_tags WHERE created_date = ?").bind(today).first(),
      env.DB.prepare("SELECT type, status, COUNT(*) as count FROM queue_jobs WHERE DATE(created_at) = ? GROUP BY type, status").bind(today).all()
    ]);

    return {
      timestamp: new Date().toISOString(),
      pipeline_health: {
        total_articles: totalArticles?.count || 0,
        extracted_articles: extractedArticles?.count || 0,
        vectorized_articles: vectorizedArticles?.count || 0,
        summarized_articles: summarizedArticles?.count || 0,
        todays_tags: todaysTags?.count || 0
      },
      completion_rates: {
        extraction_rate: totalArticles?.count > 0 ? 
          ((extractedArticles?.count || 0) / totalArticles.count * 100).toFixed(1) + '%' : '0%',
        vectorization_rate: extractedArticles?.count > 0 ? 
          ((vectorizedArticles?.count || 0) / extractedArticles.count * 100).toFixed(1) + '%' : '0%',
        summarization_rate: vectorizedArticles?.count > 0 ? 
          ((summarizedArticles?.count || 0) / vectorizedArticles.count * 100).toFixed(1) + '%' : '0%'
      },
      queue_status: recentJobs.results || []
    };

  } catch (error) {
    console.error('Failed to get pipeline status:', error);
    return { error: error.message };
  }
}
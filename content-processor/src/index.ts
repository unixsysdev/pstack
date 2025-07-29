interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  ORCHESTRATOR_URL: string;
  CHUTES_AI_TOKEN: string;
}

interface ProcessRequest {
  article_id: number;
  content_key: string;
}

interface AIAnalysis {
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  bias_analysis: string;
  factual_claims: string[];
  geopolitical_implications: string[];
  perspectives: {
    western: string;
    eastern: string;
    middle_eastern: string;
    global_south: string;
    neutral: string;
    analytical: string;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/process' && request.method === 'POST') {
      try {
        const body: ProcessRequest = await request.json();
        ctx.waitUntil(processContent(body, env));
        return new Response('Content processing initiated', { status: 200 });
      } catch (error) {
        console.error('Processing error:', error);
        return new Response('Processing failed', { status: 500 });
      }
    }
    
    if (url.pathname === '/health') {
      return new Response('Content Processor OK', { status: 200 });
    }
    
    return new Response('Content Processor Worker', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

async function processContent(req: ProcessRequest, env: Env): Promise<void> {
  try {
    // Get content from R2
    const contentObj = await env.CONTENT_BUCKET.get(req.content_key);
    if (!contentObj) {
      console.error('Content not found in R2:', req.content_key);
      return;
    }
    
    const contentData = await contentObj.json() as any;
    const content = contentData.content;
    
    if (!content || content.length < 100) {
      console.error('Insufficient content for processing');
      return;
    }
    
    // Process with AI
    const analysis = await analyzeWithAI(content, env);
    
    // Store analysis results in R2
    const analysisKey = `analyses/${req.article_id}.json`;
    await env.CONTENT_BUCKET.put(analysisKey, JSON.stringify({
      article_id: req.article_id,
      analysis,
      processed_at: new Date().toISOString()
    }, null, 2), {
      httpMetadata: {
        contentType: 'application/json'
      }
    });
    
    // Store analysis in database  
    await env.DB.prepare(`
      INSERT INTO ai_analyses (
        article_id, summary, key_points, sentiment, bias_analysis, 
        factual_claims, geopolitical_implications, perspectives, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      req.article_id,
      analysis.summary,
      JSON.stringify(analysis.key_points),
      analysis.sentiment,
      analysis.bias_analysis,
      JSON.stringify(analysis.factual_claims),
      JSON.stringify(analysis.geopolitical_implications),
      JSON.stringify(analysis.perspectives),
      new Date().toISOString()
    ).run();
    
    // Update article in DB
    await env.DB.prepare(`
      UPDATE articles 
      SET processed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      new Date().toISOString(),
      req.article_id
    ).run();
    
    // Trigger vectorization
    await fetch(env.ORCHESTRATOR_URL + '/vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article_id: req.article_id,
        content_key: req.content_key,
        analysis_key: analysisKey
      })
    });
    
    console.log(`AI analysis completed for article ${req.article_id}`);
  } catch (error) {
    console.error('Content processing failed:', error);
  }
}

async function analyzeWithAI(content: string, env: Env): Promise<AIAnalysis> {
  const prompt = `Analyze the following geopolitical news article. Provide a comprehensive multi-perspective analysis:

Article Content:
${content.substring(0, 4000)}

Please provide:
1. A concise summary (max 200 words)
2. Key points (5-7 bullet points)
3. Overall sentiment (positive/negative/neutral)
4. Bias analysis - identify potential bias and perspective
5. Major factual claims that can be verified
6. Geopolitical implications and significance
7. Six different perspective analyses:
   - Western perspective (US/EU viewpoint)
   - Eastern perspective (China/Russia viewpoint) 
   - Middle Eastern perspective
   - Global South perspective
   - Neutral analytical perspective
   - Academic/research perspective

Format as JSON with the following structure:
{
  "summary": "...",
  "key_points": [...],
  "sentiment": "positive|negative|neutral",
  "bias_analysis": "...",
  "factual_claims": [...],
  "geopolitical_implications": [...],
  "perspectives": {
    "western": "...",
    "eastern": "...",
    "middle_eastern": "...",
    "global_south": "...",
    "neutral": "...",
    "analytical": "..."
  }
}`;
  
  try {
    const response = await fetch('https://llm.chutes.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CHUTES_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'moonshotai/Kimi-K2-Instruct-tools',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false,
        max_tokens: 2048,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const aiResponse = await response.json();
    const aiContent = aiResponse.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }
    
    // Try to parse JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback: create structured response from text
    return {
      summary: aiContent.substring(0, 200),
      key_points: ['AI analysis available in raw format'],
      sentiment: 'neutral' as const,
      bias_analysis: 'Analysis pending',
      factual_claims: [],
      geopolitical_implications: [],
      perspectives: {
        western: aiContent.substring(0, 500),
        eastern: '',
        middle_eastern: '',
        global_south: '',
        neutral: '',
        analytical: ''
      }
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      summary: 'AI analysis failed',
      key_points: [],
      sentiment: 'neutral' as const,
      bias_analysis: 'Analysis unavailable',
      factual_claims: [],
      geopolitical_implications: [],
      perspectives: {
        western: '',
        eastern: '',
        middle_eastern: '',
        global_south: '',
        neutral: '',
        analytical: ''
      }
    };
  }
}
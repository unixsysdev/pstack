interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  OPENROUTER_API_KEY: string;
}

interface DailyTag {
  name: string;
  description: string;
  category: string;
  relevance_articles: number[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  geographical_focus: string[];
  time_sensitivity: string;
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
          status: 'AI Tag Generator operational - Creating intelligence tags',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/generate-daily-tags' && request.method === 'POST') {
        const { days_back = 1, force_regenerate = false } = await request.json();
        const result = await generateDailyTags(env, days_back, force_regenerate);
        return Response.json(result, { headers: corsHeaders });
      }

      if (url.pathname === '/tags' && request.method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const tags = await getDailyTags(env, date);
        return Response.json({ date, tags }, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'AI Tag Generation System - PerspectiveStack Intelligence',
        endpoints: {
          'POST /generate-daily-tags': 'Generate AI tags for recent articles',
          'GET /tags?date=YYYY-MM-DD': 'Get tags for specific date',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('Tag Generator error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🏷️ Generating daily AI tags...');
    await generateDailyTags(env, 1, false);
    console.log('✅ Daily tag generation completed');
  }
};

async function generateDailyTags(env: Env, daysBack: number = 1, forceRegenerate: boolean = false): Promise<any> {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysBack);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    console.log(`🏷️ Generating tags for ${dateStr}`);
    
    // Check if tags already exist for this date
    if (!forceRegenerate) {
      const existing = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM daily_tags WHERE created_date = ?'
      ).bind(dateStr).first();
      
      if (existing && existing.count > 0) {
        console.log(`✅ Tags already exist for ${dateStr}`);
        return { message: `Tags already exist for ${dateStr}`, regenerated: false };
      }
    }
    
    // Get articles from the target date with summaries
    const articles = await env.DB.prepare(`
      SELECT 
        a.id, a.title, a.url, a.source_name, a.created_at,
        s.summary
      FROM articles a
      LEFT JOIN ai_summaries s ON a.id = s.article_id
      WHERE DATE(a.created_at) = ?
      AND s.summary IS NOT NULL
      ORDER BY a.created_at DESC
      LIMIT 100
    `).bind(dateStr).all();
    
    if (!articles.results || articles.results.length === 0) {
      return { message: `No articles with summaries found for ${dateStr}`, tags_generated: 0 };
    }
    
    console.log(`📊 Analyzing ${articles.results.length} articles for tag generation`);
    
    // Prepare content for AI analysis
    const articleSummaries = articles.results.map((article: any) => ({
      id: article.id,
      title: article.title,
      source: article.source_name,
      summary: article.summary?.substring(0, 300) || article.title
    }));
    
    const analysisPrompt = `You are an elite intelligence analyst creating strategic tags for PerspectiveStack.com. Analyze these ${articleSummaries.length} articles from ${dateStr} and generate 8-15 HIGHLY SPECIFIC, CREATIVE intelligence tags.

ARTICLES TO ANALYZE:
${articleSummaries.map(a => `[${a.id}] ${a.title} (${a.source}): ${a.summary}`).join('\n')}

CREATE DIVERSE, SPECIFIC TAGS like:
🔥 CONFLICT ZONES: "Ukraine War", "Gaza Operations", "Red Sea Crisis", "Taiwan Tensions", "Armenia-Azerbaijan"
🚀 WEAPONS TECH: "Hypersonic Weapons", "Drone Warfare", "Space Weapons", "Cyber Attacks", "Nuclear Threats"
🏢 STARTUP CORNER: "Defense Startups", "AI Companies", "Space Tech", "Cybersecurity Firms", "Military Contracts"
🌍 GEOPOLITICS: "China-US Rivalry", "NATO Expansion", "BRICS Alliance", "Energy Wars", "Supply Chain Wars"
🎯 OPERATIONS: "Israeli Operations", "Russian Offensives", "US Deployments", "Iranian Proxies", "Special Forces"
💰 ECONOMICS: "Sanctions Impact", "Defense Spending", "Energy Prices", "Trade Wars", "Currency Wars"
🔍 INTELLIGENCE: "Espionage Cases", "Cyber Breaches", "Surveillance Tech", "Intelligence Leaks", "Covert Ops"
🏛️ POLICY SHIFTS: "Arms Deals", "Military Aid", "Diplomatic Breakthroughs", "Treaty Changes", "Alliance Updates"

For each tag, return JSON:
{
  "name": "Ukraine War Updates" (BE SPECIFIC!),
  "description": "Latest battlefield developments and strategic implications",
  "category": "conflict",
  "priority": "urgent",
  "geographical_focus": ["Ukraine", "Russia", "NATO"],
  "article_ids": [relevant IDs],
  "keywords": ["ukraine", "war", "battlefield", "offensive", "defense"]
}

REQUIREMENTS:
- Be ULTRA-SPECIFIC (not "Defense News" but "Hypersonic Weapons Development")
- Mix regional conflicts, tech developments, business moves, policy changes
- Include startup/business angle when relevant
- Create tags that intelligence professionals would search for
- Each tag should cluster 2-8 related articles
- Focus on actionable intelligence categories

Return ONLY the JSON array. Make these tags IRRESISTIBLE to intelligence professionals!`;

    const aiTags = await generateTagsWithAI(env, analysisPrompt);
    
    if (!aiTags || aiTags.length === 0) {
      throw new Error('Failed to generate AI tags');
    }
    
    // Store tags in database
    let tagsStored = 0;
    for (const tag of aiTags) {
      try {
        const tagResult = await env.DB.prepare(`
          INSERT INTO daily_tags 
          (tag_name, tag_description, article_count, created_date, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          tag.name,
          tag.description,
          tag.article_ids?.length || 0,
          dateStr,
          new Date().toISOString()
        ).run();
        
        const tagId = tagResult.meta.last_row_id;
        
        // Link articles to tags
        if (tag.article_ids && Array.isArray(tag.article_ids)) {
          for (const articleId of tag.article_ids) {
            try {
              await env.DB.prepare(`
                INSERT INTO article_tags 
                (article_id, tag_id, relevance_score, created_at)
                VALUES (?, ?, ?, ?)
              `).bind(
                articleId,
                tagId,
                1.0,
                new Date().toISOString()
              ).run();
            } catch (linkError) {
              console.error(`Failed to link article ${articleId} to tag ${tagId}:`, linkError);
            }
          }
        }
        
        tagsStored++;
        console.log(`✅ Stored tag: ${tag.name} (${tag.article_ids?.length || 0} articles)`);
        
      } catch (tagError) {
        console.error(`Failed to store tag ${tag.name}:`, tagError);
      }
    }
    
    console.log(`🏷️ Generated ${tagsStored} intelligence tags for ${dateStr}`);
    
    return {
      date: dateStr,
      articles_analyzed: articles.results.length,
      tags_generated: tagsStored,
      tags: aiTags.map(t => ({ name: t.name, description: t.description, category: t.category }))
    };
    
  } catch (error) {
    console.error('Tag generation failed:', error);
    throw error;
  }
}

async function generateTagsWithAI(env: Env, prompt: string): Promise<DailyTag[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://perspectivestack.com',
        'X-Title': 'PerspectiveStack Intelligence Platform'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content returned from AI');
    }
    
    // Parse JSON response
    try {
      const tags = JSON.parse(content);
      return Array.isArray(tags) ? tags : [];
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      return [];
    }
    
  } catch (error) {
    console.error('AI tag generation failed:', error);
    return [];
  }
}

async function getDailyTags(env: Env, date: string): Promise<any[]> {
  try {
    const tags = await env.DB.prepare(`
      SELECT 
        dt.id,
        dt.tag_name,
        dt.tag_description,
        dt.article_count,
        dt.created_at,
        COUNT(at.article_id) as linked_articles
      FROM daily_tags dt
      LEFT JOIN article_tags at ON dt.id = at.tag_id
      WHERE dt.created_date = ?
      GROUP BY dt.id
      ORDER BY dt.article_count DESC, dt.created_at DESC
    `).bind(date).all();
    
    return tags.results || [];
  } catch (error) {
    console.error('Failed to get daily tags:', error);
    return [];
  }
}
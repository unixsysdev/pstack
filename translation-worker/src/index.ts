interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: any;
  CHUTES_API_TOKEN: string;
}

interface TranslationRequest {
  article_id: number;
  original_content_key: string;
  original_language?: string;
  force_translate?: boolean;
}

interface TranslationResult {
  translated_content: string;
  detected_language: string;
  confidence: number;
  translation_model: string;
}

interface LanguageDetection {
  language: string;
  confidence: number;
}

class TranslationWorker {
  constructor(private env: Env) {}

  async pollJobs(): Promise<any[]> {
    try {
      const response = await fetch('https://queue-manager.marcelbutucea.workers.dev/workers/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_type: 'translate',
          limit: 3
        })
      });

      if (!response.ok) return [];
      const { jobs } = await response.json();
      return jobs || [];
    } catch (error) {
      console.error('Error polling translation jobs:', error);
      return [];
    }
  }

  async completeJob(jobId: string): Promise<void> {
    try {
      await fetch(`https://queue-manager.marcelbutucea.workers.dev/jobs/${jobId}/complete`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to complete translation job:', error);
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
      console.error('Failed to mark translation job as failed:', error);
    }
  }

  async detectLanguage(text: string): Promise<LanguageDetection> {
    try {
      // Use chutes.ai for language detection
      const response = await fetch('https://llm.chutes.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHUTES_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "moonshotai/Kimi-K2-Instruct",
          messages: [
            {
              role: "user",
              content: `Detect the language of this text and respond with JSON format: {"language": "code", "confidence": 0.0}. Text: "${text.substring(0, 500)}"`
            }
          ],
          max_tokens: 50,
          temperature: 0.1
        })
      });

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      
      if (content) {
        try {
          const parsed = JSON.parse(content);
          return {
            language: parsed.language || 'unknown',
            confidence: parsed.confidence || 0.5
          };
        } catch (e) {
          // Fallback to simple detection
          return this.simpleLanguageDetection(text);
        }
      }
      
      return this.simpleLanguageDetection(text);
    } catch (error) {
      console.error('Language detection failed:', error);
      return this.simpleLanguageDetection(text);
    }
  }

  simpleLanguageDetection(text: string): LanguageDetection {
    const lowerText = text.toLowerCase();
    
    // Simple heuristics for common languages
    if (/[一-龯]/.test(text)) {
      return { language: 'zh', confidence: 0.8 };
    } else if (/[ひらがなカタカナ]/.test(text)) {
      return { language: 'ja', confidence: 0.8 };
    } else if (/[가-힣]/.test(text)) {
      return { language: 'ko', confidence: 0.8 };
    } else if (/[а-я]/.test(text)) {
      return { language: 'ru', confidence: 0.7 };
    } else if (/[àâäçéèêëïîôùûüÿñæœ]/.test(text)) {
      return { language: 'fr', confidence: 0.6 };
    } else if (/[äöüß]/.test(text)) {
      return { language: 'de', confidence: 0.6 };
    } else if (/[áéíóúüñ¿¡]/.test(text)) {
      return { language: 'es', confidence: 0.6 };
    } else {
      return { language: 'en', confidence: 0.5 };
    }
  }

  async translateContent(text: string, targetLanguage: string = 'en'): Promise<TranslationResult> {
    try {
      const response = await fetch('https://llm.chutes.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHUTES_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "moonshotai/Kimi-K2-Instruct",
          messages: [
            {
              role: "system",
              content: "You are a professional translator. Translate the given text to English while preserving the original meaning, tone, and context. Only return the translated text without any additional comments."
            },
            {
              role: "user",
              content: `Translate this text to English: ${text.substring(0, 2000)}`
            }
          ],
          max_tokens: 2048,
          temperature: 0.3,
          stream: false
        })
      });

      const result = await response.json();
      const translatedContent = result.choices?.[0]?.message?.content || text;
      
      return {
        translated_content: translatedContent.trim(),
        detected_language: 'unknown', // Will be set by caller
        confidence: 0.8,
        translation_model: 'moonshotai/Kimi-K2-Instruct'
      };
    } catch (error) {
      console.error('Translation failed:', error);
      throw new Error(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createEmbeddings(text: string, articleId: number, metadata: any): Promise<void> {
    try {
      // Use Cloudflare AI for embeddings
      const chunks = this.chunkText(text, 500);
      const vectors = [];

      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: chunks[i]
          });

          if (embedding && embedding.data && Array.isArray(embedding.data[0])) {
            vectors.push({
              id: `${articleId}_translated_chunk_${i}`,
              values: embedding.data[0],
              metadata: {
                article_id: articleId,
                chunk_index: i,
                content: chunks[i].substring(0, 200),
                title: metadata.title || '',
                source: metadata.source_name || '',
                category: metadata.category || 'general',
                language: 'en',
                translated: true
              }
            });
          }
        } catch (embeddingError) {
          console.error(`Failed to generate embedding for chunk ${i}:`, embeddingError);
        }
      }

      if (vectors.length > 0) {
        await this.env.VECTORIZE_INDEX.upsert(vectors);
        console.log(`✅ Created ${vectors.length} embeddings for translated article ${articleId}`);

        // Store metadata in database
        for (const vector of vectors) {
          await this.env.DB.prepare(`
            INSERT OR REPLACE INTO vector_embeddings 
            (id, article_id, chunk_index, content_preview, vector_id, language, translated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            vector.id,
            articleId,
            vector.metadata.chunk_index,
            vector.metadata.content,
            vector.id,
            'en',
            true
          ).run();
        }
      }
    } catch (error) {
      console.error('Embedding creation failed:', error);
      throw error;
    }
  }

  chunkText(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    let currentChunk = '';
    for (const sentence of sentences) {
      const testChunk = currentChunk + sentence + '. ';
      
      if (testChunk.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence + '. ';
      } else {
        currentChunk = testChunk;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 50);
  }

  async saveTranslatedContent(articleId: number, originalContentKey: string, translationResult: TranslationResult): Promise<string> {
    try {
      // Get original content
      const originalContentObj = await this.env.CONTENT_BUCKET.get(originalContentKey);
      if (!originalContentObj) {
        throw new Error(`Original content not found: ${originalContentKey}`);
      }

      const originalData = JSON.parse(await originalContentObj.text());
      
      // Create translated content object
      const translatedData = {
        ...originalData,
        article_id: articleId,
        translated_content: translationResult.translated_content,
        detected_language: translationResult.detected_language,
        translation_confidence: translationResult.confidence,
        translation_model: translationResult.translation_model,
        translated_at: new Date().toISOString(),
        original_content_key: originalContentKey
      };

      // Save translated content
      const translatedKey = `articles/${articleId}_translated.json`;
      await this.env.CONTENT_BUCKET.put(translatedKey, JSON.stringify(translatedData, null, 2), {
        httpMetadata: { contentType: 'application/json' }
      });

      // Update article record
      await this.env.DB.prepare(`
        UPDATE articles SET 
          translated_content_key = ?,
          detected_language = ?,
          translation_confidence = ?,
          translation_model = ?,
          translated_at = ?,
          status = 'translated',
          updated_at = ?
        WHERE id = ?
      `).bind(
        translatedKey,
        translationResult.detected_language,
        translationResult.confidence,
        translationResult.translation_model,
        new Date().toISOString(),
        new Date().toISOString(),
        articleId
      ).run();

      console.log(`✅ Saved translated content for article ${articleId}`);
      return translatedKey;
    } catch (error) {
      console.error('Failed to save translated content:', error);
      throw error;
    }
  }
}

async function translateArticle(req: TranslationRequest, env: Env): Promise<void> {
  try {
    console.log(`🌐 Translating article ${req.article_id} from ${req.original_content_key}`);
    
    // Get original content
    const originalContentObj = await env.CONTENT_BUCKET.get(req.original_content_key);
    if (!originalContentObj) {
      throw new Error(`Original content not found: ${req.original_content_key}`);
    }

    const originalData = JSON.parse(await originalContentObj.text());
    const originalContent = originalData.content;

    if (!originalContent || originalContent.length < 100) {
      throw new Error(`Content too short: ${originalContent?.length || 0} chars`);
    }

    // Detect language
    console.log(`🔍 Detecting language for article ${req.article_id}`);
    const detection = await new TranslationWorker(env).detectLanguage(originalContent);
    console.log(`🎯 Detected language: ${detection.language} (${detection.confidence} confidence)`);

    // Skip translation if already English or high confidence English
    if (detection.language === 'en' && detection.confidence > 0.7 && !req.force_translate) {
      console.log(`✅ Article ${req.article_id} is already in English, skipping translation`);
      
      // Still create embeddings for the original content
      await new TranslationWorker(env).createEmbeddings(originalContent, req.article_id, {
        title: originalData.title,
        source_name: originalData.source_name,
        category: originalData.category || 'general'
      });

      // Update status
      await env.DB.prepare(`
        UPDATE articles SET 
          detected_language = ?,
          translation_confidence = ?,
          status = 'translated',
          updated_at = ?
        WHERE id = ?
      `).bind(
        detection.language,
        detection.confidence,
        new Date().toISOString(),
        req.article_id
      ).run();
      
      return;
    }

    // Translate content
    console.log(`🔄 Translating article ${req.article_id} from ${detection.language} to English`);
    const translationResult = await new TranslationWorker(env).translateContent(originalContent, 'en');
    translationResult.detected_language = detection.language;
    translationResult.confidence = detection.confidence;

    console.log(`✅ Translation completed for article ${req.article_id}`);

    // Save translated content
    const translatedKey = await new TranslationWorker(env).saveTranslatedContent(
      req.article_id, 
      req.original_content_key, 
      translationResult
    );

    // Create embeddings for translated content
    console.log(`🧠 Creating embeddings for translated article ${req.article_id}`);
    await new TranslationWorker(env).createEmbeddings(
      translationResult.translated_content, 
      req.article_id, 
      {
        title: originalData.title,
        source_name: originalData.source_name,
        category: originalData.category || 'general'
      }
    );

    console.log(`🎉 Article ${req.article_id} translation and embedding completed`);

  } catch (error) {
    console.error('❌ Translation failed:', error);
    
    // Update article status with error
    await env.DB.prepare(`
      UPDATE articles SET 
        status = 'translation_failed',
        translation_error = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      error instanceof Error ? error.message : String(error),
      new Date().toISOString(),
      req.article_id
    ).run();
    
    throw error;
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
          status: 'Translation Worker operational - Chutes.ai Kimi-K2-Instruct',
          timestamp: new Date().toISOString() 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/process' && request.method === 'POST') {
        const worker = new TranslationWorker(env);
        const jobs = await worker.pollJobs();
        
        let processed = 0;
        for (const job of jobs) {
          try {
            await translateArticle(job.payload, env);
            await worker.completeJob(job.id);
            processed++;
          } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
          }
        }
        
        return Response.json({ 
          success: true, 
          processed_jobs: processed,
          total_jobs: jobs.length 
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/translate' && request.method === 'POST') {
        const payload = await request.json();
        await translateArticle(payload, env);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname === '/detect-language' && request.method === 'POST') {
        const { text } = await request.json();
        const detection = await new TranslationWorker(env).detectLanguage(text);
        return Response.json(detection, { headers: corsHeaders });
      }

      return Response.json({ 
        message: 'Translation Worker - Chutes.ai Kimi-K2-Instruct',
        endpoints: {
          'POST /process': 'Process translation jobs from queue',
          'POST /translate': 'Translate single article',
          'POST /detect-language': 'Detect language of text',
          'GET /health': 'Health check'
        }
      }, { headers: corsHeaders });

    } catch (error) {
      console.error('Translation Worker error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🔄 Processing translation jobs...');
    const worker = new TranslationWorker(env);
    const jobs = await worker.pollJobs();
    
    for (const job of jobs) {
      try {
        await translateArticle(job.payload, env);
        await worker.completeJob(job.id);
      } catch (error) {
        await worker.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
  }
};
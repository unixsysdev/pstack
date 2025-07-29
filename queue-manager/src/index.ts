// queue-manager/src/index.ts
interface Env {
  DB: D1Database;
  CONTENT_BUCKET: R2Bucket;
}

interface QueueJob {
  id: string;
  type: 'rss_collect' | 'content_extract' | 'vectorize' | 'summarize';
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  assigned_worker?: string;
  priority: number;
}

class QueueManager {
  constructor(private env: Env) {}

  async createJob(type: string, payload: any, priority: number = 1, maxAttempts: number = 3): Promise<string> {
    const id = crypto.randomUUID();
    const job: QueueJob = {
      id,
      type: type as any,
      payload: JSON.stringify(payload),
      status: 'pending',
      attempts: 0,
      max_attempts: maxAttempts,
      created_at: new Date().toISOString(),
      priority
    };

    await this.env.DB.prepare(`
      INSERT INTO queue_jobs (id, type, payload, status, attempts, max_attempts, created_at, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      job.id, job.type, job.payload, job.status, 
      job.attempts, job.max_attempts, job.created_at, job.priority
    ).run();

    console.log(`📥 Created job ${id} (${type})`);
    return id;
  }

  async getJobsForWorker(workerType: string, limit: number = 5): Promise<QueueJob[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM queue_jobs 
      WHERE type = ? AND status = 'pending'
      ORDER BY priority DESC, created_at ASC 
      LIMIT ?
    `).bind(workerType, limit).all();

    const jobs = result.results?.map(row => ({
      ...row,
      payload: JSON.parse(row.payload as string)
    })) as QueueJob[] || [];

    // Mark jobs as processing
    for (const job of jobs) {
      await this.markJobProcessing(job.id, `worker-${workerType}-${Date.now()}`);
    }

    return jobs;
  }

  async markJobProcessing(jobId: string, workerId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE queue_jobs 
      SET status = 'processing', started_at = ?, assigned_worker = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), workerId, jobId).run();
  }

  async completeJob(jobId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE queue_jobs 
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), jobId).run();
    
    console.log(`✅ Job ${jobId} completed`);
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const job = await this.env.DB.prepare(`
      SELECT attempts, max_attempts FROM queue_jobs WHERE id = ?
    `).bind(jobId).first();

    if (!job) return;

    const newAttempts = (job.attempts as number) + 1;
    const maxAttempts = job.max_attempts as number;

    if (newAttempts >= maxAttempts) {
      await this.env.DB.prepare(`
        UPDATE queue_jobs 
        SET status = 'failed', error = ?, attempts = ?
        WHERE id = ?
      `).bind(error, newAttempts, jobId).run();
      console.log(`❌ Job ${jobId} failed permanently: ${error}`);
    } else {
      await this.env.DB.prepare(`
        UPDATE queue_jobs 
        SET status = 'pending', error = ?, attempts = ?, assigned_worker = NULL
        WHERE id = ?
      `).bind(error, newAttempts, jobId).run();
      console.log(`🔄 Job ${jobId} scheduled for retry (attempt ${newAttempts})`);
    }
  }

  async getQueueStats(): Promise<any> {
    const today = new Date().toISOString().split('T')[0];

    const [pending, processing, completedToday, failedToday] = await Promise.all([
      this.env.DB.prepare("SELECT COUNT(*) as count FROM queue_jobs WHERE status = 'pending'").first(),
      this.env.DB.prepare("SELECT COUNT(*) as count FROM queue_jobs WHERE status = 'processing'").first(),
      this.env.DB.prepare("SELECT COUNT(*) as count FROM queue_jobs WHERE status = 'completed' AND DATE(completed_at) = ?").bind(today).first(),
      this.env.DB.prepare("SELECT COUNT(*) as count FROM queue_jobs WHERE status = 'failed' AND DATE(created_at) = ?").bind(today).first()
    ]);

    return {
      pending: pending?.count as number || 0,
      processing: processing?.count as number || 0,
      completed_today: completedToday?.count as number || 0,
      failed_today: failedToday?.count as number || 0,
      worker_health: {}
    };
  }

  async cleanup(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Reset stale processing jobs
    await this.env.DB.prepare(`
      UPDATE queue_jobs 
      SET status = 'pending', assigned_worker = NULL
      WHERE status = 'processing' AND started_at < ?
    `).bind(fiveMinutesAgo).run();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const qm = new QueueManager(env);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case '/health':
          return Response.json({ status: 'Queue Manager operational', timestamp: new Date().toISOString() }, { headers: corsHeaders });

        case '/jobs':
          if (request.method === 'POST') {
            const { type, payload, priority = 1, max_attempts = 3 } = await request.json();
            const jobId = await qm.createJob(type, payload, priority, max_attempts);
            return Response.json({ success: true, job_id: jobId }, { headers: corsHeaders });
          }
          
          if (request.method === 'GET') {
            const status = url.searchParams.get('status');
            const type = url.searchParams.get('type');
            const limit = parseInt(url.searchParams.get('limit') || '50');
            
            let query = 'SELECT * FROM queue_jobs WHERE 1=1';
            const params: any[] = [];
            
            if (status) {
              query += ' AND status = ?';
              params.push(status);
            }
            if (type) {
              query += ' AND type = ?';
              params.push(type);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);
            
            const result = await env.DB.prepare(query).bind(...params).all();
            const jobs = result.results?.map(row => ({
              ...row,
              payload: JSON.parse(row.payload as string)
            })) || [];
            
            return Response.json({ jobs }, { headers: corsHeaders });
          }
          break;

        case '/workers/poll':
          if (request.method === 'POST') {
            const { worker_type, limit = 5 } = await request.json();
            const jobs = await qm.getJobsForWorker(worker_type, limit);
            return Response.json({ jobs }, { headers: corsHeaders });
          }
          break;

        case '/stats':
          const stats = await qm.getQueueStats();
          return Response.json(stats, { headers: corsHeaders });

        case '/cleanup':
          if (request.method === 'POST') {
            await qm.cleanup();
            return Response.json({ success: true, message: 'Cleanup completed' }, { headers: corsHeaders });
          }
          break;

        default:
          if (url.pathname.startsWith('/jobs/')) {
            const jobId = url.pathname.split('/')[2];
            const action = url.pathname.split('/')[3];

            if (action === 'complete' && request.method === 'POST') {
              await qm.completeJob(jobId);
              return Response.json({ success: true }, { headers: corsHeaders });
            }

            if (action === 'fail' && request.method === 'POST') {
              const { error } = await request.json();
              await qm.failJob(jobId, error);
              return Response.json({ success: true }, { headers: corsHeaders });
            }

            if (action === 'retry' && request.method === 'POST') {
              await env.DB.prepare("UPDATE queue_jobs SET status = 'pending', attempts = 0 WHERE id = ?").bind(jobId).run();
              return Response.json({ success: true }, { headers: corsHeaders });
            }
          }
          
          return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Queue Manager error:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const qm = new QueueManager(env);
    await qm.cleanup();
    console.log('🧹 Queue cleanup completed');
  }
};
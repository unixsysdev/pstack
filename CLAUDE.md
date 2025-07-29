# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PStack is an Advanced Geopolitical Intelligence Processing Platform built on Cloudflare Workers. It processes RSS feeds from geopolitical news sources through a queue-based microservices architecture, extracting content, generating AI summaries, creating vector embeddings, and providing real-time monitoring.

## Architecture

The system consists of 8 Cloudflare Workers forming a processing pipeline:

1. **RSS Collector** (`/rss-collector/`) - Fetches articles from 81+ RSS sources
2. **Content Extractor** (`/content-extractor/`) - Extracts clean content from web pages
3. **Content Processor** (`/content-processor/`) - Processes extracted content 
4. **Vector Worker** (`/vector-worker/`) - Creates embeddings using Cloudflare AI
5. **AI Summarizer** (`/ai-summarizer/`) - Generates summaries using OpenRouter Gemini
6. **Queue Manager** (`/queue-manager/`) - Manages job queues between workers
7. **Dashboard** (`/dashboard/`) - Web-based monitoring and control interface
8. **Orchestrator** (`/orchestrator/`) - Coordinates pipeline workflow

## Technology Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** D1 (SQLite) for metadata, R2 for content storage, Vectorize for embeddings
- **AI:** Cloudflare AI (@cf/baai/bge-base-en-v1.5), OpenRouter API (Gemini 2.0 Flash)
- **Deployment:** Wrangler CLI

## Development & Deployment

**This project deploys directly to production - no local development servers are used.**

### Deployment
Deploy individual workers using wrangler:
```bash
cd [worker-directory]
wrangler deploy
```

Monitor deployment with:
```bash
wrangler logs
```

## Database Schema

Key tables in D1 database:
- `articles` - Article metadata and processing status
- `rss_sources` - RSS feed configurations (81 geopolitical sources)
- `queue_jobs` - Job queue management with retry logic
- `ai_summaries` - Generated AI summaries
- `vector_embeddings` - Vector metadata
- `processing_queue` - Pipeline status tracking

## Queue System

Job types: `rss_collect`, `content_extract`, `vectorize`, `summarize`
Job statuses: `pending`, `processing`, `completed`, `failed`, `retrying`

Workers poll queues, process jobs, and update statuses with automatic retry logic and cleanup.

## Configuration

Each worker has:
- `wrangler.jsonc` - Worker configuration with D1/R2/Vectorize bindings
- `tsconfig.json` - TypeScript configuration
- Environment variables for API keys and endpoints

RSS sources are configured in `rss.json` with categories (defense_policy, economic, diplomatic, conflict) and geographic focus.

## Processing Pipeline Flow

```
RSS Sources → RSS Collector → Content Extractor → Vector Worker → AI Summarizer
                ↓                    ↓                ↓            ↓
            Queue Manager ←---- Queue Manager ←-- Queue Manager ←--
                ↓
            Dashboard (monitoring)
```

## Development Process

1. Make code changes to worker TypeScript files
2. Deploy worker using `wrangler deploy` in the worker directory
3. Test functionality on production using worker endpoints
4. Monitor via dashboard and health endpoints (`/health` on each worker)
5. Check worker logs with `wrangler logs`

## Error Handling

The system includes comprehensive error logging, automatic retry mechanisms with exponential backoff, failed job recovery, and health monitoring via the dashboard interface.
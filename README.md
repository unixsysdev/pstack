# PStack Intelligence Platform
Test page https://perspectivestack.com/

A geopolitical intelligence processing platform built on Cloudflare Workers that aggregates news from 87+ international sources and provides AI-powered analysis.

## Architecture

The system consists of 8 Cloudflare Workers forming a processing pipeline:

- **RSS Collector** - Fetches articles from RSS feeds
- **Content Extractor** - Extracts clean content from web pages
- **Content Processor** - Processes extracted content
- **Vector Worker** - Creates embeddings using Cloudflare AI
- **AI Summarizer** - Generates summaries using OpenRouter Gemini API
- **Queue Manager** - Manages job queues between workers
- **Dashboard** - Admin interface for monitoring and control
- **Frontend** - Public-facing intelligence dashboard

## Technology Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** D1 (SQLite) for metadata
- **Storage:** R2 for content storage
- **Vector Database:** Cloudflare Vectorize for embeddings
- **AI:** Cloudflare AI + OpenRouter API (Gemini 2.5 Flash Lite)

## Features

- Automated RSS collection from international news sources
- Content extraction and processing
- AI-powered article summarization
- Vector-based similarity search
- Tag-based article organization
- Real-time monitoring dashboard
- Search functionality

## Sources

The platform monitors 87 RSS feeds from sources including:
- Defense publications (Breaking Defense, Defense News, Jane's)
- International news (Al Jazeera, RT, BBC, Reuters)
- Think tanks (Brookings, RAND, Atlantic Council)
- Regional sources (Times of Israel, Kyiv Independent, Global Times)
- Government feeds (Pentagon, NATO, UN)

## Deployment

Each worker is deployed independently using Wrangler:

```bash
cd [worker-directory]
wrangler deploy
```

## Database Schema

Key tables:
- `articles` - Article metadata and processing status
- `rss_sources` - RSS feed configurations
- `queue_jobs` - Job queue management
- `ai_summaries` - Generated AI summaries
- `daily_tags` - Tag organization system

## Processing Flow

1. RSS Collector fetches articles from sources
2. Content Extractor retrieves full article content
3. AI Summarizer generates article summaries
4. Vector Worker creates embeddings for similarity search
5. Tag Generator organizes articles by topic
6. Dashboard provides monitoring and control interface

## Configuration

Workers are configured via `wrangler.jsonc` files with appropriate bindings for D1, R2, and Vectorize resources. API keys are stored as Cloudflare secrets.

## Monitoring

The admin dashboard provides real-time monitoring of:
- Collection statistics
- Processing queue status
- Failed sources
- System health

The public frontend offers tag-based exploration and search capabilities.

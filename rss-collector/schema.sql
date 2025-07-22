CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  published_at TEXT,
  source_name TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_articles_url ON articles(url);
CREATE INDEX idx_articles_source ON articles(source_name);
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_category ON articles(category);

CREATE TABLE processing_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE rss_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rss_url TEXT NOT NULL,
  main_url TEXT NOT NULL,
  category TEXT NOT NULL,
  update_frequency TEXT,
  geo_focus TEXT, -- JSON array
  tags TEXT, -- JSON array
  last_checked TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  summary TEXT,
  key_points TEXT, -- JSON array
  sentiment TEXT,
  bias_analysis TEXT,
  factual_claims TEXT, -- JSON array
  geopolitical_implications TEXT, -- JSON array
  perspectives TEXT, -- JSON object with 6 perspectives
  created_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE vector_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  embedding_id TEXT, -- Vectorize ID
  content_chunk TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id)
);
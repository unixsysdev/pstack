-- Create a test article for pipeline testing
INSERT INTO articles (id, url, title, description, source_name, published_at, created_at, status)
VALUES (
  999,
  'https://www.defenseone.com/technology/test-ai-initiative',
  'Pentagon Launches New AI Initiative for Defense Technology',
  'Pentagon announces comprehensive AI initiative for defense technology development',
  'Defense One',
  '2025-07-28T22:15:00.000Z',
  '2025-07-28T22:15:00.000Z',
  'extracted'
)
ON CONFLICT(id) DO UPDATE SET
  url = excluded.url,
  title = excluded.title,
  description = excluded.description,
  source_name = excluded.source_name,
  status = excluded.status;
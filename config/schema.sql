CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  project_path  TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL,
  model         TEXT,
  turn_count    INTEGER DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_summaries (
  session_id    TEXT PRIMARY KEY REFERENCES sessions(id),
  summary       TEXT NOT NULL,
  outcome       TEXT CHECK(outcome IN ('completed', 'abandoned', 'partial')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  type          TEXT NOT NULL CHECK(type IN (
                  'decision',
                  'pattern',
                  'mistake',
                  'blocker',
                  'learning'
                )),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  file_ref      TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS insight_tags (
  insight_id    INTEGER NOT NULL REFERENCES insights(id),
  tag           TEXT NOT NULL,
  PRIMARY KEY (insight_id, tag)
);

CREATE TABLE IF NOT EXISTS transcripts (
  session_id    TEXT PRIMARY KEY REFERENCES sessions(id),
  content       TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS insight_vec_v2 USING vec0(
  insight_id INTEGER PRIMARY KEY,
  embedding FLOAT[384] distance_metric=cosine
);

CREATE INDEX IF NOT EXISTS idx_insights_session ON insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_type    ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insight_tags_tag ON insight_tags(tag);

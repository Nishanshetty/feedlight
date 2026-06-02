-- ─── feeds ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feeds (
  id              TEXT PRIMARY KEY,
  url             TEXT NOT NULL UNIQUE,
  title           TEXT,
  site_url        TEXT,
  last_fetched_at TEXT,
  etag            TEXT,
  fetch_interval  INTEGER NOT NULL DEFAULT 900,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_feeds_last_fetched ON feeds (last_fetched_at);

-- ─── feed_items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_items (
  id            TEXT PRIMARY KEY,
  feed_id       TEXT NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  title         TEXT,
  link          TEXT,
  content       TEXT,
  published_at  TEXT,
  guid          TEXT NOT NULL,
  content_hash  TEXT,
  author        TEXT,
  thumbnail_url TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (feed_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_feed_items_feed_published ON feed_items (feed_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_published ON feed_items (published_at DESC);

-- ─── subscriptions ────────────────────────────────────────────────────────────
-- Single-user: no user_id column.
CREATE TABLE IF NOT EXISTS subscriptions (
  id         TEXT PRIMARY KEY,
  feed_id    TEXT NOT NULL UNIQUE REFERENCES feeds (id) ON DELETE CASCADE,
  folder     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_feed ON subscriptions (feed_id);

-- ─── item_states ──────────────────────────────────────────────────────────────
-- Per-item read/saved/starred state. Single-user: no user_id.
-- INTEGER 0/1 used for booleans (SQLite has no native boolean type).
CREATE TABLE IF NOT EXISTS item_states (
  item_id    TEXT PRIMARY KEY REFERENCES feed_items (id) ON DELETE CASCADE,
  is_read    INTEGER NOT NULL DEFAULT 0,
  is_saved   INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_item_states_saved    ON item_states (item_id) WHERE is_saved = 1;
CREATE INDEX IF NOT EXISTS idx_item_states_starred  ON item_states (item_id) WHERE is_starred = 1;

-- ─── tags ─────────────────────────────────────────────────────────────────────
-- Article-level tags. `name_norm` (lowercased/trimmed) is the dedup key so
-- "React" and "react" collapse to one tag.
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_norm  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─── item_tags ────────────────────────────────────────────────────────────────
-- Which tags are on which items. `source` records provenance so the sources can
-- coexist: 'manual' (user), 'feed' (RSS <category>), 'feed_default' (per-feed rule).
-- Manual wins on the shared (item_id, tag_id) row.
CREATE TABLE IF NOT EXISTS item_tags (
  item_id    TEXT NOT NULL REFERENCES feed_items (id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags (id)       ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag  ON item_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags (item_id);

-- ─── feed_default_tags ────────────────────────────────────────────────────────
-- Tags applied automatically to every new item from a feed.
CREATE TABLE IF NOT EXISTS feed_default_tags (
  feed_id TEXT NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags (id)  ON DELETE CASCADE,
  PRIMARY KEY (feed_id, tag_id)
);

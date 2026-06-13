-- ─── highlights ───────────────────────────────────────────────────────────────
-- Text-quote anchored highlights (W3C style): the exact quote plus ~30 chars of
-- surrounding context for re-anchoring against re-extracted article content.
CREATE TABLE IF NOT EXISTS highlights (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES feed_items (id) ON DELETE CASCADE,
  quote      TEXT NOT NULL,
  prefix     TEXT,
  suffix     TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_highlights_item ON highlights (item_id);
CREATE INDEX IF NOT EXISTS idx_highlights_created ON highlights (created_at DESC);

-- ─── item_content ─────────────────────────────────────────────────────────────
-- Extracted article (JSON: title, byline, siteName, content), archived when an
-- item gets its first highlight so anchors resolve against stable text instead
-- of a live re-fetch.
CREATE TABLE IF NOT EXISTS item_content (
  item_id      TEXT PRIMARY KEY REFERENCES feed_items (id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  archived_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

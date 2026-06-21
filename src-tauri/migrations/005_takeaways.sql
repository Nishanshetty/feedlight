-- ─── item_takeaways ───────────────────────────────────────────────────────────
-- Cached AI key takeaways per item, so they aren't regenerated on every open.
-- `model` records which Ollama model produced them; a model change invalidates
-- the cache (the client regenerates). `takeaways_json` is a JSON array of strings.
CREATE TABLE IF NOT EXISTS item_takeaways (
  item_id        TEXT PRIMARY KEY REFERENCES feed_items (id) ON DELETE CASCADE,
  takeaways_json TEXT NOT NULL,
  model          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

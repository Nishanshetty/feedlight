-- Reading progress (0..1) per item, driven by the article pane's scroll position.
ALTER TABLE item_states ADD COLUMN read_progress REAL NOT NULL DEFAULT 0;

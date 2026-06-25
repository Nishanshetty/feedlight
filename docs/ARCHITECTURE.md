# Feedlight — Architecture

Developer reference for how Feedlight is put together. Generated from the code; if
something here disagrees with the source, the source wins — please update this doc.

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Process & data flow](#process--data-flow)
- [Database](#database)
- [Rust backend](#rust-backend)
- [Frontend](#frontend)
- [Feature → code map](#feature--code-map)
- [Settings & secrets](#settings--secrets)

---

## Overview

Feedlight is a **local-first desktop RSS/Atom reader** built with Tauri 2. There is
no server and no account — all data lives in a local SQLite database on the user's
machine, and the app works offline.

The defining architectural split:

- **Rust owns the network and the OS.** Feed fetching, article HTML fetching,
  text-to-speech, Ollama calls, and credential storage all run in Rust. This is
  deliberate: routing network calls through Rust sidesteps the WebView's CORS/CSP
  restrictions and keeps API keys out of the renderer.
- **JavaScript owns the UI and content extraction.** The React frontend renders
  everything and runs Mozilla Readability (the Firefox Reader View engine) on the
  raw HTML that Rust fetches.

The two halves talk over Tauri's IPC: the frontend `invoke()`s Rust **commands**,
and the background crawler pushes a Tauri **event** back to the frontend.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Shell | [Tauri 2](https://tauri.app) (macOS; universal arm64 + x86_64) |
| Frontend | React 19, TypeScript, Vite 7, Tailwind 3 |
| Routing | TanStack Router ([src/routeTree.ts](../src/routeTree.ts)) |
| DB | SQLite via `tauri-plugin-sql` |
| Prefs | `tauri-plugin-store` (`settings.json`) |
| Secrets | OS keychain via `security-framework` |
| Feed parsing | `feed-rs` (Rust) |
| Article extraction | `@mozilla/readability` + `dompurify` (JS) |
| HTTP | `reqwest` (Rust) |

---

## Process & data flow

```
┌─────────────────────────── WebView (React) ───────────────────────────┐
│  components / pages → src/lib/db.ts ─────────┐                         │
│                       src/lib/settings.ts ───┤  invoke()  (IPC)        │
└──────────────────────────────────────────────┼────────────────────────┘
                                                ▼
┌─────────────────────────────── Rust (Tauri) ───────────────────────────┐
│  commands/*  ──►  reqwest / Readability-input / Google TTS / Ollama     │
│  crawler.rs  ──►  SQLite (feed_items)  ──►  emit "feedlight://feeds-     │
│                                              refreshed"  ──► frontend    │
│  tauri-plugin-sql  ◄──────────────────────────  src/lib/db.ts queries   │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Frontend → Rust:** the UI calls Tauri commands with `invoke()`. SQLite is
  accessed directly from the frontend through `tauri-plugin-sql` in
  [src/lib/db.ts](../src/lib/db.ts) — the crawler is the only place Rust writes the DB.
- **Background crawler:** a Rust `tokio` task ([src-tauri/src/crawler.rs](../src-tauri/src/crawler.rs))
  refreshes subscribed feeds every 15 minutes, writes new `feed_items`, prunes old
  ones, and emits `feedlight://feeds-refreshed`.
- **Rust → Frontend:** [src/lib/hooks/use-feed-refresh.ts](../src/lib/hooks/use-feed-refresh.ts)
  listens for that event and refreshes the timeline/sidebar.

---

## Database

SQLite, managed by `tauri-plugin-sql`. Migrations live in
[src-tauri/migrations/](../src-tauri/migrations/) and are registered (with version
numbers) in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs). TypeScript row shapes
are in [src/types/database.ts](../src/types/database.ts); all queries are in
[src/lib/db.ts](../src/lib/db.ts).

### Tables

**`feeds`** — one row per feed source.
`id` (PK), `url` (UNIQUE), `title`, `site_url`, `last_fetched_at`, `etag`,
`fetch_interval` (default 900s), `created_at`.

**`subscriptions`** — which feeds the user follows, and their folder. Single-user.
`id` (PK), `feed_id` (UNIQUE → feeds, cascade), `folder` (nullable), `created_at`.
A feed only appears in the sidebar/analytics if it has a subscription row.

**`feed_items`** — individual articles.
`id` (PK), `feed_id` (→ feeds, cascade), `title`, `link`, `content`,
`published_at`, `guid`, `content_hash`, `author`, `thumbnail_url`, `created_at`.
UNIQUE `(feed_id, guid)` — the crawler upserts on this.

**`item_states`** — per-item user state (single-user; booleans are 0/1 INTEGERs).
`item_id` (PK → feed_items, cascade), `is_read`, `is_saved`, `is_starred`,
`read_progress` (REAL 0..1), `updated_at`.

**`item_content`** — archived extracted article (JSON: title/byline/siteName/content).
`item_id` (PK → feed_items, cascade), `content_json`, `archived_at`. Written when an
item is highlighted or saved, so highlight anchors resolve against stable text and
saved/offline reads open instantly.

**`highlights`** — text-quote-anchored highlights (W3C style: quote + surrounding context).
`id` (PK), `item_id` (→ feed_items, cascade), `quote`, `prefix`, `suffix`, `note`,
`created_at`.

**`item_takeaways`** — cache of AI key takeaways so they aren't regenerated per open.
`item_id` (PK → feed_items, cascade), `takeaways_json`, `model`, `created_at`. A
model change invalidates the cache (the client regenerates).

### Migrations

| Version | File | Adds |
|---------|------|------|
| 1 | `001_initial.sql` | `feeds`, `feed_items`, `subscriptions`, `item_states` |
| 2 | _(skipped)_ | a one-off manual cleanup, never registered |
| 3 | `003_read_progress.sql` | `item_states.read_progress` column |
| 4 | `004_highlights.sql` | `highlights`, `item_content` |
| 5 | `005_takeaways.sql` | `item_takeaways` |

> **Gotcha:** running the app applies registered migrations to the dev DB
> immediately. Reverting a migration file does **not** un-apply it, and the next
> migration that reuses a version number is silently skipped. When reverting, check
> `_sqlx_migrations` or burn the version number. Next free version is **6**.

### Conventions

- **Saved = `is_starred`.** The UI "Saved" view is backed by the `is_starred` flag
  (the column name predates the rename). `is_saved` exists but is currently unused.
- **Reserved `__saved__` feed.** External articles saved from the reader (⌘L) are
  stored as `feed_items` under a reserved, never-subscribed feed with id `__saved__`
  (url `feedlight://saved`). Because it has no subscription row, it stays out of the
  sidebar feed list, analytics, and unread counts, while reusing `item_states` and
  `item_content`. Created lazily via `INSERT OR IGNORE`.

---

## Rust backend

Entry point [src-tauri/src/lib.rs](../src-tauri/src/lib.rs): registers SQL migrations,
spawns the crawler, installs macOS hardening, and wires the command handler.

### Commands (`invoke` targets)

Grouped by module under [src-tauri/src/commands/](../src-tauri/src/commands/):

| Module | Commands | Purpose |
|--------|----------|---------|
| `credentials` | `get_credential`, `set_credential` | OS keychain access (service `app.feedlight`) |
| `feed` | `fetch_feed`, `resolve_youtube_handle` | RSS/Atom fetch + autodiscovery; YouTube `@handle` → channel |
| `extract` | `fetch_article_html`, `fetch_image_base64` | Fetch raw HTML for Readability; inline images past CSP |
| `tts` | `synthesize_speech`, `list_tts_voices` | Google Cloud TTS (REST, user API key) |
| `ollama` | `check_ollama`, `summarize_article`, `chat_article`, `suggest_questions`, `key_takeaways`, `generate_digest`, `generate_discover_queries` | Local Ollama via `reqwest` |
| `video` | `open_video_window` | Open a YouTube watch page top-level in its own window |
| `export` | `export_markdown` | Write highlights markdown (e.g. to an Obsidian vault) |

### Other Rust modules

- [crawler.rs](../src-tauri/src/crawler.rs) — `run_crawler` (15-min background loop)
  and `refresh_feeds_now` (manual refresh command). Fetches, upserts `feed_items`,
  prunes (keeps newest N / drops > max age, but never starred or highlighted), emits
  `feedlight://feeds-refreshed`.
- [macos.rs](../src-tauri/src/macos.rs) — macOS-only hardening for the wake-from-sleep
  AppKit crash: logs uncaught `NSException`s (name + reason) to
  `app_data_dir/crash.log` and hardens window handling.

---

## Frontend

### `src/lib`

| File | Responsibility |
|------|----------------|
| [db.ts](../src/lib/db.ts) | All SQLite queries (timeline, item state, feeds, highlights, saved, takeaways cache, analytics, digest) |
| [settings.ts](../src/lib/settings.ts) | Preferences (store) + secrets (keychain) accessors |
| [analytics.ts](../src/lib/analytics.ts) | Classifies feeds (noisy / ignored / dead) for the dashboard |
| [opml.ts](../src/lib/opml.ts) | OPML import/export (client-side XML) |
| [theme.ts](../src/lib/theme.ts) | App light/dark/system theme |
| [date-range.ts](../src/lib/date-range.ts) | Timeline date-range filters |
| [highlight-anchor.ts](../src/lib/highlight-anchor.ts) | Text-quote anchoring/re-anchoring for highlights |
| [hooks/use-feed-refresh.ts](../src/lib/hooks/use-feed-refresh.ts) | Subscribes to `feedlight://feeds-refreshed` |
| [hooks/use-keyboard-shortcuts.ts](../src/lib/hooks/use-keyboard-shortcuts.ts) | Global keyboard shortcuts |

### Pages & routing

TanStack Router. [RootLayout](../src/pages/RootLayout.tsx) wraps
[HomePage](../src/pages/HomePage.tsx) (the main shell, which switches between the
timeline and the Saved/Highlights/Digest/Discover/Analytics views),
[SettingsPage](../src/pages/SettingsPage.tsx), and [AnalyticsPage](../src/pages/AnalyticsPage.tsx).

### Key components

[AppShell](../src/components/AppShell.tsx) (header + sidebar + main, ⌘L read-URL),
[SidebarContent](../src/components/SidebarContent.tsx) / [SidebarNav](../src/components/SidebarNav.tsx),
[Timeline](../src/components/Timeline.tsx) → [TimelineList](../src/components/TimelineList.tsx) → [FeedItemCard](../src/components/FeedItemCard.tsx),
[ArticlePane](../src/components/ArticlePane.tsx) (reader: extraction, TTS, AI, highlights, save, minimize, YouTube window),
plus [SavedView](../src/components/SavedView.tsx), [HighlightsView](../src/components/HighlightsView.tsx),
[DigestView](../src/components/DigestView.tsx), [DiscoverView](../src/components/DiscoverView.tsx),
[AnalyticsDashboard](../src/components/AnalyticsDashboard.tsx), [AddFeedForm](../src/components/AddFeedForm.tsx),
[OpmlControls](../src/components/OpmlControls.tsx), [ReadUrlModal](../src/components/ReadUrlModal.tsx),
[ShortcutsModal](../src/components/ShortcutsModal.tsx).

---

## Feature → code map

| Feature | Frontend | Backend |
|---------|----------|---------|
| Subscribe / autodiscover | `AddFeedForm`, `db.addFeed` | `feed::fetch_feed` |
| YouTube channels | `AddFeedForm` | `feed::resolve_youtube_handle` |
| Timeline / search / density | `Timeline`, `TimelineList`, `FeedItemCard` | — (reads via `db.ts`) |
| Background refresh | `use-feed-refresh` | `crawler` + `feedlight://feeds-refreshed` |
| Reader / extraction | `ArticlePane` | `extract::fetch_article_html`, `fetch_image_base64` |
| Resume reading | `ArticlePane` scroll → `item_states.read_progress` | — |
| Text-to-speech | `ArticlePane` (system) | `tts::synthesize_speech`, `list_tts_voices` (google) |
| AI summary / chat / takeaways / discover | `ArticlePane`, `DiscoverView`, `DigestView` | `ollama::*` |
| Highlights | `ArticlePane`, `HighlightsView`, `highlight-anchor` | `export::export_markdown` (→ Obsidian) |
| Saved (feed items + external) | `SavedView`, `ArticlePane`, `db` (`__saved__` feed) | — |
| YouTube playback | `ArticlePane` | `video::open_video_window` |
| OPML | `OpmlControls`, `opml.ts` | — |
| Analytics | `AnalyticsDashboard`, `analytics.ts` | — |
| Settings / keys | `SettingsPage`, `settings.ts` | `credentials::*` |

---

## Settings & secrets

Two stores, by sensitivity:

- **Preferences** → `tauri-plugin-store` (`settings.json` in the app data dir), via
  [src/lib/settings.ts](../src/lib/settings.ts): `tts_engine` (`system` | `google`),
  `tts_voice`, `tts_voice_lang`, `app_theme`, `obsidian_vault_path`, `ollama_enabled`,
  `ollama_url`, `ollama_model`.
- **Secrets** → OS keychain (service `app.feedlight`) via the `credentials` commands:
  `youtube_api_key`, `gcp_tts_api_key`. These never touch the plaintext store.

Ollama is **off by default** and enabled from Settings. All AI runs against a locally
running Ollama model — nothing leaves the machine.

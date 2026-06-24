# Feedlight — Conventions

> Architecture, DB schema, and the feature → code map now live in
> **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. This file keeps the short list
> of cross-cutting decisions. For history, use `git log`.

## Architecture Decisions

- All data local: SQLite via `tauri-plugin-sql`; no cloud backend.
- Feed parsing in Rust (`feed-rs`); article extraction in JS
  (`@mozilla/readability`) on HTML fetched by the `fetch_article_html` Rust command
  (bypasses CORS).
- Background crawler is a Rust `tokio` task; emits the `feedlight://feeds-refreshed`
  Tauri event to the frontend.
- Secrets (`youtube_api_key`, `gcp_tts_api_key`) live in the OS keychain via the
  `credentials` commands. Non-secret preferences live in `tauri-plugin-store`
  (`settings.json`). Nothing leaves the machine.
- TTS engines: `system` (WebView `speechSynthesis`) and `google` (Google Cloud TTS
  REST, called from Rust with the user's API key).
- Ollama calls go through Rust (`reqwest`) to avoid WebView CORS/CSP issues — same
  pattern as TTS. Ollama is off by default and enabled from Settings.
- Migrations are append-only and version-numbered; never reuse a version (see the
  migration gotcha in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#migrations)).

# Feedlight

> **Because focus matters.**

A local-first RSS reader for macOS. No accounts, no servers, no subscriptions — your feeds live on your machine.

<!-- TODO: add screenshot once first build is ready -->
<!-- ![Feedlight screenshot](docs/screenshot.png) -->

---

## Features

- **Local-first** — all data stored in SQLite on your Mac; works fully offline
- **RSS & Atom** — subscribe to any RSS/Atom feed; paste a site URL and Feedlight auto-discovers the feed
- **YouTube channels** — subscribe to channels by URL (`/channel/`, `/user/`, or `@handle` with API key)
- **Article timeline** — magazine-style cards or compact list density, hero lead story, article images, read-time estimates, date group headers, infinite scroll, full-text search (`/`), and a Starred view
- **Resume reading** — scroll position is remembered per article; cards show a progress line and reopening picks up where you left off
- **Article reader** — distraction-free reading pane powered by Mozilla Readability (same engine as Firefox Reader View), with reading progress bar, read-time estimate, link hover previews, and a per-article accent color drawn from the lead image
- **Text to Speech** — paragraph-by-paragraph read-aloud via Google Cloud TTS (Neural2 voice), with playback speed control and click-a-paragraph to jump
- **AI features** — streamed article summaries, automatic key takeaways, chat about any article with suggested questions, and select-text Explain/Ask — powered by a model running on your own machine — [Ollama](https://ollama.com) or any OpenAI-compatible server such as llama.cpp or LM Studio (fully private, no cloud required) — or by [Gemini](https://aistudio.google.com/apikey) with your own API key
- **Discover** — AI-generated search queries based on your subscriptions surface fresh articles from outside your feeds (requires AI to be enabled)
- **Background refresh** — feeds refresh automatically every 15 minutes in Rust; no browser tab needed
- **OPML import/export** — migrate from Feedly, Inoreader, or any other reader instantly
- **Feed analytics** — identify noisy, ignored, and dead feeds to declutter your reading list
- **Keyboard shortcuts** — `j/k` navigate, `o/Enter` open, `m` toggle read, `s` star, `Shift+A` mark all read
- **Reader customisation** — Light / Sepia / Slate / Dark themes, font family, font size, column width, line spacing

---

## Download

Pre-built macOS universal binaries (arm64 + x86_64) are available on the [Releases](../../releases) page.

---

## Build from source

### Prerequisites

| Tool | Version |
|------|---------|
| [Rust](https://rustup.rs) | 1.80+ (stable) |
| Node.js | 18+ |
| Xcode Command Line Tools | Any recent version |

### Steps

```bash
git clone https://github.com/nishanshetty/feedlight.git
cd feedlight
npm install
npm run tauri dev        # development build with hot-reload
npm run tauri build      # production .dmg + .app
```

The production build outputs to `src-tauri/target/release/bundle/`.

---

## Configuring API keys

Open **Settings** (gear icon in the top bar) to configure optional integrations:

| Setting | Where to get it | Used for |
|---------|----------------|---------|
| **YouTube Data API key** | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → YouTube Data API v3 | Subscribing to `@handle` YouTube channels |
| **Google Cloud TTS credentials** | GCP Console → IAM → Service Accounts → create key (JSON) | Article read-aloud feature |
| **Local API URL** | [ollama.com](https://ollama.com) (`ollama pull llama3.2`), or any OpenAI-compatible server: llama.cpp, vLLM, LM Studio | AI features, run locally. Ollama needs no key; an OpenAI-compatible server usually wants a bearer key |
| **Gemini API key** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | AI features, run in the cloud |

Preferences live in the app data directory via `tauri-plugin-store`; API keys live in the macOS keychain, never in the plaintext store. Each key is sent only to the service it belongs to, over HTTPS. Selecting Gemini also sends **article text** to Google — every other feature, including the Local provider, keeps article content on your machine.

### AI setup

Pick one provider in Settings → **AI**. Local is the default and keeps article text
on your machine; Gemini is faster and needs no local model, but sends article text to
Google under your own key.

**Local — Ollama**

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull llama3.2`
2. Open Feedlight → Settings → **AI**, toggle it on, choose **Local**
3. Confirm the Local API URL (`http://localhost:11434`) — the model field fills itself from
   whatever your instance has installed; pick one or type a name
4. Hit **Test**

**Local — OpenAI-compatible server**

1. Run any server that speaks `/v1/models` and `/v1/chat/completions` — llama.cpp's
   `llama-server` on port 8080, vLLM, LM Studio's local server
2. Settings → **AI** → **Local**, set the protocol to **OpenAI-compatible**
3. Set the Local API URL (`http://192.168.1.10:8080` — `/v1` is added for you), save the
   bearer key under **API key**, then pick a model from the list

The **API key** field only appears for the OpenAI-compatible protocol. Ollama's own API has
no notion of one, so the Ollama protocol never sends an `Authorization` header — a key you
saved for the other protocol stays in the keychain, unused, until you switch back.

**Gemini**

1. Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Open Feedlight → Settings → **AI**, toggle it on, choose **Gemini**
3. Paste the key, **Save**, then hit **Test**

Either way, open any article — a sparkle button (✦) appears in the reader header.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Router | TanStack Router |
| Database | SQLite via `tauri-plugin-sql` + `sqlx` |
| Feed parsing | [`feed-rs`](https://crates.io/crates/feed-rs) |
| Article extraction | [`@mozilla/readability`](https://github.com/mozilla/readability) |
| HTTP | `reqwest` (Rust) |
| TTS auth | `jsonwebtoken` (RS256 JWT for Google OAuth2) |
| AI | [Ollama](https://ollama.com) or any OpenAI-compatible local server, or the Gemini REST API |
| Settings | `tauri-plugin-store` |

---

## Project structure

```
src/                  # React / TypeScript frontend
  components/         # UI components
  lib/                # db.ts, settings.ts, analytics.ts, hooks
  pages/              # TanStack Router pages
  types/              # TypeScript types
src-tauri/            # Rust / Tauri backend
  src/
    commands/         # fetch_feed, fetch_article_html, tts, ai/, resolve_youtube_handle
    crawler.rs        # background feed refresh loop
    lib.rs            # Tauri app setup
  migrations/         # SQLite schema
```

For a deeper dive — architecture, full DB schema, the Rust command/IPC surface, and
a feature → code map — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev
setup and checks. When your pull request is ready, comment **`/ready`** on it:
it gets the `ready to review` label and a review request. Once it's approved
and every check passes, it's labelled `ready to merge` automatically.

---

## License

[MIT](LICENSE) © 2026 Nishan Shetty

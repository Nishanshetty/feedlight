# Contributing to Focal

Thanks for your interest in contributing! Here's everything you need to get started.

## Dev setup

```bash
# 1. Install Rust (if you don't have it)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Clone and install
git clone https://github.com/nishanshetty/focal.git
cd focal
npm install

# 3. Start the dev server
npm run tauri dev
```

The Vite frontend hot-reloads on save. Rust changes trigger a recompile (a few seconds).

## Project layout

| Path | What lives here |
|------|----------------|
| `src/components/` | React UI components |
| `src/lib/` | `db.ts` (SQLite queries), `settings.ts` (API keys), `analytics.ts`, hooks |
| `src/pages/` | TanStack Router pages |
| `src/types/` | Shared TypeScript types |
| `src-tauri/src/commands/` | Tauri commands (feed, extract, tts, youtube) |
| `src-tauri/src/crawler.rs` | Background feed refresh loop |
| `src-tauri/migrations/` | SQLite migrations |

## Before opening a PR

```bash
npm run typecheck     # TypeScript — must pass
npm run lint          # ESLint
cd src-tauri && cargo check   # Rust — must pass
```

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Match the existing code style (TypeScript strict, no `any`, Tailwind for styling)
- No new npm or Cargo dependencies without a discussion in the issue first
- Rust commands must handle errors gracefully and return a `Result<T, String>`
- Don't commit API keys, credentials, or `.env` files

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include your macOS version, Focal version, and steps to reproduce.

## Suggesting features

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md). Describe the problem you're solving, not just the solution.

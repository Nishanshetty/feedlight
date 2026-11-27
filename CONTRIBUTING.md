# Contributing to Feedlight

Thanks for your interest in contributing! Here's everything you need to get started.

## Dev setup

```bash
# 1. Install Rust (if you don't have it)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Clone and install
git clone https://github.com/nishanshetty/feedlight.git
cd feedlight
npm install

# 3. Start the dev server
npm run tauri dev
```

The Vite frontend hot-reloads on save. Rust changes trigger a recompile (a few seconds).

> **Text-to-speech** uses the system voice (WebView `speechSynthesis`) or Google
> Cloud TTS (with your own API key) — no local speech engine is compiled, so there's
> no CMake/espeak build dependency.

## Project layout

For a full architecture overview, the DB schema, the Rust command surface, and a
feature → code map, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

| Path | What lives here |
|------|----------------|
| `docs/ARCHITECTURE.md` | Architecture, DB schema, command/IPC surface, feature map |
| `src/components/` | React UI components |
| `src/lib/` | `db.ts` (SQLite queries), `settings.ts` (API keys), `analytics.ts`, hooks |
| `src/pages/` | TanStack Router pages |
| `src/types/` | Shared TypeScript types |
| `src-tauri/src/commands/` | Tauri commands (feed, extract, tts, youtube) |
| `src-tauri/src/crawler.rs` | Background feed refresh loop |
| `src-tauri/migrations/` | SQLite migrations |

## Tests

```bash
npm test              # Vitest, frontend unit tests (jsdom)
npm run test:watch    # watch mode
cd src-tauri && cargo test --lib   # Rust unit tests
```

Needs **Node 22.10 or newer** (`package.json` declares it): Vitest pulls in undici 8,
which binds `zlib.createZstdDecompress` at import time and that function does not
exist on Node 20 — the run dies before reading a single test file.

Tests sit next to the code they cover: `src/lib/*.test.ts` for the frontend,
`#[cfg(test)] mod tests` at the bottom of each Rust module. Both suites run in CI
([`.github/workflows/test.yml`](.github/workflows/test.yml)) on every push and PR.

What is covered today is the pure logic — feed classification, OPML output, date
ranges, highlight anchoring, URL validation, feed-URL discovery, filename
sanitising. The Tauri command surface (network, keychain, SQLite) is not covered
yet; adding it means either an in-memory SQLite fixture or a mock IPC layer.

When you fix a bug, add the test that would have caught it first.

## Before opening a PR

```bash
npm test                  # Vitest — must pass
npx tsc --noEmit          # TypeScript — must pass
cd src-tauri && cargo test --lib   # Rust — must pass
cd src-tauri && cargo check        # Rust — must pass
npm run format            # Prettier — formats src/ (CI fails on unformatted code)
npm run lint              # oxlint — errors must be fixed; warnings are advisory
npm run lint:rust         # rustfmt + clippy — must pass (`cargo fmt` fixes formatting)
```

The repo-wide reformat is listed in `.git-blame-ignore-revs`. Run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once so `git blame`
skips it.

Using a coding agent? The project notes for it are in [`AGENTS.md`](AGENTS.md),
which most agents read on their own. Claude Code loads them through `CLAUDE.md`
and also picks up the shared permissions in `.claude/settings.json`; put
personal overrides in `.claude/settings.local.json`, which is git-ignored.

Fill in the PR template when you open the PR, and attach screenshots or a short
screen recording for anything that changes the UI.

## Getting your PR reviewed and merged

Two labels track where a PR is. You don't add them yourself; a comment and
the checks do it for you.

1. **Open your PR** and push until you're happy with it.
2. **Comment `/ready`** on the PR. A 👍 on your comment means it was picked up:
   the PR gets the **`ready to review`** label and the maintainer is asked to
   review it.
3. **Review.** Address any comments. Pushing new commits removes the labels,
   because the code changed, so comment `/ready` again when you're done.
4. **Ready to merge.** Once the PR is approved, every required check is green
   (including the CodeQL scan) and all comment threads are resolved, the label
   switches to **`ready to merge`** and the maintainer is notified to merge it.

| Label | Means | Added by |
|-------|-------|----------|
| `ready to review` | The author says the PR is ready | Commenting `/ready`, or a maintainer by hand |
| `ready to merge` | Approved, checks green, threads resolved | Automatically |

> **Maintainers:** resolving a comment thread doesn't trigger any automation.
> If that was the last thing missing, re-check by hand: **Actions → Ready to
> merge → Run workflow**, with the PR number.

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Match the existing code style (TypeScript strict, no `any`, Tailwind for styling)
- No new npm or Cargo dependencies without a discussion in the issue first
- Rust commands must handle errors gracefully and return a `Result<T, String>`
- Don't commit API keys, credentials, or `.env` files

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include your macOS version, Feedlight version, and steps to reproduce.

## Suggesting features

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md). Describe the problem you're solving, not just the solution.

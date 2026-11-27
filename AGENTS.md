# Feedlight

A macOS RSS reader: Tauri 2 (Rust) backend, React 19 + TypeScript frontend,
local SQLite. Architecture, DB schema and the feature → code map are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); releases and signing are in
[docs/RELEASING.md](docs/RELEASING.md). Read those before larger changes.

Read [CONVENTIONS.md](CONVENTIONS.md) first: it lists the cross-cutting
decisions (all data local, where secrets live, what runs in Rust).

## Commands

- `npm run dev:app`: run the app. It builds as "Feedlight Dev"
  (`app.feedlight.dev`), so its data is separate from an installed Feedlight.
- Before calling work done, these must pass (CI runs the same):
  - `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`
  - `npm run lint:rust` (rustfmt + clippy `-D warnings`) and
    `cd src-tauri && cargo test --lib`
- `npm run format` and `cd src-tauri && cargo fmt` fix formatting.
- Node 22.10 or newer; older versions fail before any test runs.

## Gotchas

- **Migrations are append-only.** Never edit, rename or delete a file in
  `src-tauri/migrations/`; add a new one and register it in
  `src-tauri/src/migrations.rs`. The next free version is in
  docs/ARCHITECTURE.md. `npm run dev:app` applies a new migration to the dev
  database immediately, and reverting the file does not undo it.
- **Required checks:** "Build macOS universal binary", "Unit tests (Vitest)",
  "Unit tests (cargo)" and "Migration guard" are required by the branch
  ruleset. Renaming one of these jobs blocks every PR until the ruleset is
  updated too, so keep the names or update both together.
- **Updates are disabled in dev builds** (`src/lib/updater.ts`). Signing,
  notarization and updater artifacts only happen on tag builds.
- **Privacy:** the app makes no requests on its own except the daily update
  check. A new automatic network request needs the privacy text updated
  (CONVENTIONS.md, README.md, website).

## Rules

- No new npm or Cargo dependencies without discussing it first.
- Rust commands handle errors gracefully and return `Result<T, String>`.
- TypeScript strict, no `any`; Tailwind for styling.
- When you fix a bug, add the test that would have caught it.
- Tests sit next to the code: `src/lib/*.test.ts`, and `#[cfg(test)] mod tests`
  at the bottom of each Rust module.

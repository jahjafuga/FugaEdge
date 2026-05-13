# FugaEdge — Claude Code Project Notes

FugaEdge is a premium desktop trading-journal app for momentum day traders. Currently Electron + React + TypeScript + better-sqlite3. **Planned future port: Next.js + Postgres + REST/tRPC web app.**

## REQUIRED READING — architecture rules

**Before writing any new feature, read `ARCHITECTURE.md` in the project root.** The rules there are non-negotiable for new code. They exist so the codebase stays portable to the web target without a rewrite.

@ARCHITECTURE.md

Key takeaways (the full rules are in `ARCHITECTURE.md` — do not skip):

- Business logic lives in pure modules under `/src/core` or `/src/lib` — never inside IPC handlers, never importing `electron` / `fs` / `sqlite3`.
- Data access goes through repository modules (`tradesRepo`, `sessionsRepo`, etc.) so the SQLite layer can be swapped for Postgres later without touching callers.
- React components import from `/src/api` only — never call `window.electron.*` directly.
- API keys and secrets live in the main process only; renderer requests data via IPC.
- File-system access is wrapped behind a `/src/platform/*` abstraction (Electron uses `fs`; web would upload to server).

When in doubt: **"Could this exact file run inside a Next.js page without modification?"** If no, the platform-specific part belongs in the platform / api / data layer.

## Honest note on current state

Several existing files in `electron/*/ipc.ts` and `src/*` still mix IPC plumbing with business logic — they predate the architecture rules. **New code must follow the rules even if older code nearby doesn't.** When touching legacy files, extract the pure logic to `/src/core` or `/src/lib` opportunistically; don't replicate the old pattern.

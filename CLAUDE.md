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

## Dev gotchas

**Drag-and-drop into the dev build shows the OS "no-entry" cursor with zero DOM events.** Before touching any drag-and-drop code, check whether the dev shell is running **as Administrator**. Windows UIPI silently blocks drag-and-drop from a normal-privilege File Explorer into an elevated process — the OS rejects the drag before Chromium dispatches any `dragenter`/`dragover`/`drop` event, so it looks like a code regression but is not. Fix: run `npm run dev` from a non-elevated PowerShell. Check the current shell's elevation with:

```
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
```

`True` means elevated — that is the bug, not the code. Fuller writeup: the "Windows UIPI dev-shell elevation foot-gun" entry in `docs/plans/v0.3.0-or-later-ideas.md`.

## End-of-session handoff

At the end of any Day N or Day N.5 session that ends with a commit landing, fill out the build-update brief at `docs/posts/BUILD_UPDATE_BRIEF.md` — follow that file's own "Instruction to Claude Code" section for how to fill it and what to output, and output the filled brief in a code block so it can be pasted straight into the Canva post chat. The template file is the source of truth for the format; don't restate its sections here.

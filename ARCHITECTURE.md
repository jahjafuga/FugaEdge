# ARCHITECTURE RULES — keep FugaEdge web-portable

Goal: FugaEdge is Electron-first today, but the codebase must stay architected so it can be ported to a web app (Next.js + Postgres + REST/tRPC) in the future without rewriting business logic or UI.

## WHEN BUILDING ANY NEW FEATURE:

### 1. KEEP BUSINESS LOGIC OUT OF IPC HANDLERS
- IPC handlers in `electron/main` must only call pure functions.
- All trade logic, P&L math, analytics aggregation, CSV parsing, enrichment, etc. lives in pure modules under `/src/core` or `/src/lib`.
- These modules must NOT import `electron`, `fs`, `sqlite3`, or any node-only API directly.
- Example bad: `ipcMain.handle("trades:get", () => db.prepare("SELECT...").all())`
- Example good: `ipcMain.handle("trades:get", () => tradesRepo.getAll())` where `tradesRepo` lives in `/src/data/tradesRepo.ts`

### 2. DATA ACCESS THROUGH A REPOSITORY LAYER
- All database reads/writes go through repository modules: `tradesRepo`, `fillsRepo`, `playbookRepo`, `sessionsRepo`, etc.
- Repositories expose async functions: `getAll`, `getById`, `create`, `update`, `delete`.
- SQLite implementation lives in `/src/data/sqlite/*`.
- When porting to web, swap `/src/data/sqlite` for `/src/data/postgres` and nothing else changes.

### 3. FRONTEND NEVER TALKS TO ELECTRON DIRECTLY
- React components do not call `window.electron.*` directly.
- Instead, use a thin API client module: `/src/api/client.ts`
- In Electron mode this calls IPC. In web mode it calls `fetch()`.
- Components import from `/src/api` only — they don't know which backend they hit.

### 4. THIRD-PARTY APIS WRAPPED IN SERVICE MODULES
- Polygon, Massive, future APIs: each gets a service file in `/src/services`.
- Services accept API keys as parameters, never read `process.env` directly in the renderer.
- In Electron mode, the main process injects the key. In web mode, the backend injects it server-side and never exposes to client.

### 5. NO SECRETS IN RENDERER
- API keys, tokens, anything sensitive lives in main process only.
- Renderer requests data via IPC, main process makes the external call.

### 6. FILE SYSTEM ACCESS ABSTRACTED
- CSV imports, screenshot uploads, etc: define an abstract storage interface.
- Electron implementation uses `fs`. Web implementation would upload to server.
- Components call `storage.saveFile()` — they don't know if it's local or remote.

### 7. SHARED TYPES
- All TypeScript interfaces (`Trade`, `Fill`, `Playbook`, `Session`, etc.) live in `/src/types` and are reused by both layers.

### 8. NO ELECTRON-SPECIFIC UI CODE IN COMPONENTS
- Don't use Electron menu APIs, native dialogs, or shell commands directly inside React components.
- If you need a native feature, wrap it behind a platform abstraction in `/src/platform/*` with Electron and web implementations.

## WHEN IN DOUBT:
Ask **"could this exact file run inside a Next.js page without modification?"**
If no, extract the platform-specific part into the platform/api/data layer.

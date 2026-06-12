// D1 (v0.2.5 Session 0) — dev-DB isolation decision table.
//
// Pure module: no electron, no node imports (per /ARCHITECTURE.md core
// rules — even `node:path` stays out; the join below is hand-rolled and
// separator-aware instead). The caller (electron/main) feeds in the real
// app.isPackaged / app.getPath('appData') / process.env values and applies
// the result via app.setPath + the database module's override hook.
//
// Rules:
//   packaged → userDataDir = <appData>\fugaedge, env override IGNORED
//              (a shipped install must never be re-pointable by a stray
//              environment variable).
//   dev      → userDataDir = <appData>\fugaedge-dev, so dev runs can never
//              touch the real journal, backups, or attachments.
//   dev + FUGAEDGE_DB_PATH → dbPathOverride = trimmed env path. userDataDir
//              STAYS fugaedge-dev so attachments/backups isolate too.
//   empty / whitespace-only env value = unset.

export interface DataDirsInput {
  isPackaged: boolean
  /** app.getPath('appData') */
  appDataDir: string
  /** process.env.FUGAEDGE_DB_PATH ?? null */
  envDbPath: string | null
}

export interface DataDirs {
  userDataDir: string
  dbPathOverride: string | null
}

// Join one segment onto a base dir using the base's own separator style,
// tolerating a trailing separator on the base.
function joinDir(base: string, segment: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  const trimmedBase =
    base.endsWith('\\') || base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmedBase}${sep}${segment}`
}

export function resolveDataDirs(input: DataDirsInput): DataDirs {
  if (input.isPackaged) {
    return {
      userDataDir: joinDir(input.appDataDir, 'fugaedge'),
      dbPathOverride: null,
    }
  }
  const envPath = (input.envDbPath ?? '').trim()
  return {
    userDataDir: joinDir(input.appDataDir, 'fugaedge-dev'),
    dbPathOverride: envPath === '' ? null : envPath,
  }
}

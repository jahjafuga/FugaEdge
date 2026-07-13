// The startup guard around openDatabase().
//
// openDatabase() is ALLOWED to throw: the rule-breaks pre-migration backup propagates a failed
// copy on purpose, so a machine that cannot be backed up never advances its schema past the
// point where the migration is still reachable (electron/db/database.ts). Before this guard,
// that throw landed inside app.whenReady().then(...) as an unhandled promise rejection — the
// process died with no window, no dialog and no explanation. That trades a silent data failure
// for a silent startup failure, which is not a trade.
//
// THIS DOES NOT SWALLOW THE THROW. The throw still escapes openDatabase, so db.exec(SCHEMA_SQL)
// never runs and _meta keeps its old version — fail-closed is fully intact, and a repaired
// launch picks up where it left off. All this adds is a legible ending: a real dialog, then a
// clean exit, and false to the caller so the rest of startup never runs.
//
// The Electron APIs are INJECTED, not imported, so this is unit-testable under vitest —
// electron/main/index.ts is not (it calls app.setPath and app.whenReady() at module load and
// transitively imports Electron-ABI better-sqlite3).

import { bootFailureDialog, type BootFailureDialog } from '@/core/startup/bootFailure'

export interface BootFailureDeps {
  showDialog: (dialog: BootFailureDialog) => void
  exit: (code: number) => void
  logError: (message: string) => void
}

/** Runs `boot`. Returns true on success. On a throw: log, show the dialog, exit non-zero, and
 *  return false so the caller bails out of the rest of startup. Never rethrows. */
export function bootOrFail(boot: () => void, deps: BootFailureDeps): boolean {
  try {
    boot()
    return true
  } catch (e) {
    const detail = e instanceof Error ? (e.stack ?? e.message) : String(e)
    deps.logError(`[FE startup] fatal: could not open the database — ${detail}`)

    // A dialog failure must never prevent the exit. If we cannot even tell the user what went
    // wrong, falling through into a half-booted app is still the worst available outcome.
    try {
      deps.showDialog(bootFailureDialog(e))
    } catch (dialogError) {
      deps.logError(`[FE startup] could not show the failure dialog: ${String(dialogError)}`)
    }

    deps.exit(1)
    return false
  }
}

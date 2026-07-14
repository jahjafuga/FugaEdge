// The in-progress marker. PURE in the migrate-*.ts sense: a type-only better-sqlite3 import,
// the connection passed in — so it runs under vitest with a shim AND against a real engine.
//
// IT LIVES IN _meta, NOT settings, and that is a decision, not a coin-flip:
//
//   _meta has EXACTLY ONE writer in the entire repo — schema.ts:735's key-scoped
//   `INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ...)`, which provably
//   cannot touch another key. There is no UPDATE, no DELETE, no DROP of _meta anywhere else.
//
//   `settings` survives SCHEMA_SQL too (its seeds are INSERT OR IGNORE), but it is the
//   USER-FACING KV store with many writers — the Settings page, settings/repo.ts, every
//   migration latch. One future "reset settings" feature silently destroys an in-flight marker,
//   and destroying the marker means losing the resume point: this bug, all over again.
//
// The two facts are deliberately kept apart:
//   schema_version        — what the schema PHYSICALLY is. SCHEMA_SQL still stamps it. Honest.
//   migration_in_progress — the version the chain STARTED from. Cleared ONLY on success.

import type Database from 'better-sqlite3'

export const MIGRATION_IN_PROGRESS_KEY = 'migration_in_progress'

/** The version the interrupted chain started from, or null if the last boot finished cleanly.
 *
 *  NEVER THROWS. On a fresh install _meta does not exist yet (SCHEMA_SQL has not run at the
 *  point this is called), and readSchemaVersion returns 0 through exactly the same catch
 *  (database.ts:110-112). If this threw instead, our own fail-closed boot — the throw escapes
 *  openDatabase, bootOrFail shows the dialog and exits — would brick EVERY fresh install.
 *
 *  A zero / negative / non-numeric value reads as absent. A corrupt marker must never be able
 *  to invent a resume point and re-run history; falling back to the on-disk stamp is the safe
 *  direction, because the stamp only ever over-states progress (it skips), never under-states it. */
export function readMigrationMarker(conn: Database.Database): number | null {
  try {
    const row = conn
      .prepare('SELECT value FROM _meta WHERE key = ?')
      .get(MIGRATION_IN_PROGRESS_KEY) as { value: string } | undefined
    if (!row) return null
    const n = Number.parseInt(row.value, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null // no _meta yet — fresh install
  }
}

/** Record where this migration chain STARTED. Must be durable BEFORE db.exec(SCHEMA_SQL)
 *  (database.ts:185) re-stamps the version out from under it.
 *
 *  *** INSERT OR IGNORE. NEVER INSERT OR REPLACE. THE MARKER IS WRITE-ONCE. ***
 *
 *  DOUBLE CRASH: boot 1 has _meta=28 and no marker, so it writes marker=28, SCHEMA_SQL stamps
 *  47, and it dies. Boot 2 reads marker=28 (right), and writes the marker again. If that write
 *  REPLACED, and boot 2 had naively passed readSchemaVersion() = 47, it would CLOBBER the resume
 *  point — and if boot 2 also dies, boot 3 sees marker=47, skips everything, and we are back to
 *  the original bug, silently and permanently. Write-once makes that unreachable no matter what
 *  value the caller passes.
 *
 *  THIS THROW IS NOT CAUGHT, AND THAT IS DELIBERATE. It is a two-column insert into a table we
 *  have already proven exists (the caller only reaches here when effective > 0). If it fails,
 *  the disk is full or the DB is corrupt — and running destructive migrations with no retry net
 *  is exactly the "no backup, no migration" invariant we refuse elsewhere. Let it escape
 *  openDatabase and fail the boot closed. */
export function writeMigrationMarker(conn: Database.Database, startedFromVersion: number): void {
  conn
    .prepare('INSERT OR IGNORE INTO _meta (key, value) VALUES (?, ?)')
    .run(MIGRATION_IN_PROGRESS_KEY, String(startedFromVersion))
}

/** Clear the marker. ONLY on a chain that reported no failures — see chainSucceeded.
 *
 *  Clearing it on mere RETURN is not enough: migrateAfterSchema returns normally even when a
 *  migration soft-failed, so a clear-on-return would fix the crash window and leave the (more
 *  reachable) soft-failure window wide open, and all 24 "retries next launch" comments would
 *  stay lies. */
export function clearMigrationMarker(conn: Database.Database): void {
  conn.prepare('DELETE FROM _meta WHERE key = ?').run(MIGRATION_IN_PROGRESS_KEY)
}

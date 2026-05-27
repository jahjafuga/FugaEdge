// Electron "Reset journal" implementation — Day 7.5, piece 2.
//
// Renames the live database aside so FugaEdge starts on a fresh, empty
// journal at next launch. The renamed fugaedge-reset-<ISO-ts>.db file in
// %APPDATA%\fugaedge\ is the user's only recovery path in v0.2.0 — there is
// no in-app restore (deferred to v0.2.1).

import { existsSync } from 'node:fs'
import { closeDatabase, getDbPath, openDatabase } from './database'
import { buildResetTarget, renameFile } from './backup-fs'
import type { DbResetResult } from '@shared/ipc-channels'

/**
 * Close the database and rename it (plus any WAL sidecars) aside. After this
 * returns, %APPDATA%\fugaedge\ has no fugaedge.db — the next openDatabase()
 * creates a fresh empty one. Throws on a rename failure.
 */
export function resetDatabase(): DbResetResult {
  // ORDER MATTERS:
  // 1. closeDatabase() — Windows can't rename open files
  // 2. renameFile(dbPath, resetPath) + move -wal/-shm sidecars
  // 3. on failure: openDatabase() before throwing so app stays usable
  // 4. caller schedules app.relaunch() + app.exit(0) after IPC reply flushes
  const dbPath = getDbPath()
  const resetPath = buildResetTarget(dbPath)

  closeDatabase()
  try {
    renameFile(dbPath, resetPath)
    // WAL sidecars are normally removed when the last connection closes, but
    // move any that linger so they travel with the renamed file instead of
    // attaching to the fresh DB created on next launch.
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(dbPath + suffix)) {
        renameFile(dbPath + suffix, resetPath + suffix)
      }
    }
  } catch (e) {
    // Close succeeded but the rename failed — reopen so the app stays usable
    // (the renamed-aside file, if the main rename did go through, is intact
    // either way; reopening just restores the live connection).
    openDatabase()
    throw e
  }

  return { resetPath }
}

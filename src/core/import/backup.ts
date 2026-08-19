// Import-time database safety backup (Day 7.5, piece 1).
//
// Pure orchestration — the only dependency is the injected BackupStorage, so
// this file imports no fs / electron / sqlite (ARCHITECTURE.md Rule 1) and is
// unit tested against a mocked storage.

import type { BackupResult, BackupStorage } from '@/platform/backup-storage'

/** Label segment for import-time safety backups: fugaedge-pre-import-<ts>.db */
export const PRE_IMPORT_LABEL = 'pre-import'

/** Label segment for auto-stop bulk writes: fugaedge-pre-auto-stop-<ts>.db.
 *  Its OWN label on purpose. Retention is per-label, so sharing 'pre-import'
 *  would let a few settings toggles evict the snapshots taken before real
 *  imports — the backups a user is most likely to need. */
export const AUTO_STOP_LABEL = 'pre-auto-stop'

/** Retention cap — the newest N backups PER LABEL are kept; older ones are
 *  pruned on each new backup. */
export const MAX_PRE_IMPORT_BACKUPS = 20

/**
 * Snapshot the database before an import writes to it, then prune the
 * pre-import backups down to the newest MAX_PRE_IMPORT_BACKUPS.
 *
 * - The backup write is awaited and NOT caught: if it rejects, the rejection
 *   propagates so the caller aborts the import — there is no DB write without
 *   a fresh backup.
 * - Retention pruning is best-effort: a failure to list or delete old
 *   backups is swallowed. The safety backup already exists by then;
 *   housekeeping must never abort an otherwise-safe import.
 */
export async function backupBeforeImport(
  storage: BackupStorage,
): Promise<BackupResult> {
  return backupBeforeWrite(storage, PRE_IMPORT_LABEL)
}

/**
 * The same snapshot-then-prune ritual under any label. Extracted so the auto-stop
 * bulk write can reuse the contract above verbatim — awaited, uncaught, best-effort
 * pruning — without writing into the import pool and aging real pre-import
 * snapshots out of it.
 */
export async function backupBeforeWrite(
  storage: BackupStorage,
  label: string,
): Promise<BackupResult> {
  const result = await storage.backupDatabase(label)
  await pruneOldBackups(storage, label)
  return result
}

async function pruneOldBackups(storage: BackupStorage, label: string): Promise<void> {
  try {
    const backups = await storage.listBackups(label)
    // Backup names embed an ISO-8601 timestamp, so a lexical sort of `name`
    // is chronological — oldest first.
    const oldestFirst = [...backups].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    const excess = oldestFirst.length - MAX_PRE_IMPORT_BACKUPS
    for (let i = 0; i < excess; i++) {
      await storage.deleteBackup(oldestFirst[i].path)
    }
  } catch {
    // best-effort — see the function doc above.
  }
}

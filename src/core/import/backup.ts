// Import-time database safety backup (Day 7.5, piece 1).
//
// Pure orchestration — the only dependency is the injected BackupStorage, so
// this file imports no fs / electron / sqlite (ARCHITECTURE.md Rule 1) and is
// unit tested against a mocked storage.

import type { BackupResult, BackupStorage } from '@/platform/backup-storage'

/** Label segment for import-time safety backups: fugaedge-pre-import-<ts>.db */
export const PRE_IMPORT_LABEL = 'pre-import'

/** Retention cap — the newest N pre-import backups are kept; older ones are
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
  const result = await storage.backupDatabase(PRE_IMPORT_LABEL)
  await pruneOldBackups(storage)
  return result
}

async function pruneOldBackups(storage: BackupStorage): Promise<void> {
  try {
    const backups = await storage.listBackups(PRE_IMPORT_LABEL)
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

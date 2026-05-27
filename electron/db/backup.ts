// Electron implementation of the BackupStorage contract.
//
// Main-process only — resolves %APPDATA%\fugaedge\backups\ via electron's
// app paths and checkpoints the live SQLite connection. The actual file I/O
// is delegated to backup-fs.ts (pure Node) so it stays unit-testable. Per the
// Day 7.5 proposal sign-off, the Electron impl lives under electron/ (the
// repo's convention for fs / main-process code), not src/platform/electron/.

import { app } from 'electron'
import { join } from 'node:path'
import { getDbPath, openDatabase } from './database'
import {
  copyDbFile,
  deleteFile,
  ensureDir,
  fileSafeTimestamp,
  listBackupFiles,
} from './backup-fs'
import type {
  BackupRef,
  BackupResult,
  BackupStorage,
} from '@/platform/backup-storage'

/** %APPDATA%\fugaedge\backups\ — the same folder maybeBackupForV020 uses. */
function backupsDir(): string {
  return join(app.getPath('userData'), 'backups')
}

export const electronBackupStorage: BackupStorage = {
  async backupDatabase(label: string): Promise<BackupResult> {
    try {
      const dir = backupsDir()
      ensureDir(dir)
      // Flush committed WAL pages into the main file so the single-file copy
      // is complete and self-contained. Best-effort: a checkpoint failure
      // (rare on the app's own connection) is logged, not fatal — mirrors
      // maybeBackupForV020.
      try {
        openDatabase().pragma('wal_checkpoint(TRUNCATE)')
      } catch (e) {
        console.info(
          `[FJ backup] wal_checkpoint before backup failed: ` +
            `${e instanceof Error ? e.message : String(e)}`,
        )
      }
      const name = `fugaedge-${label}-${fileSafeTimestamp()}.db`
      const path = join(dir, name)
      const bytes = copyDbFile(getDbPath(), path)
      return { path, name, bytes }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `Pre-import database backup failed: ${msg}. ` +
          `Import aborted — your database was not modified.`,
      )
    }
  },

  async listBackups(label: string): Promise<BackupRef[]> {
    return listBackupFiles(backupsDir(), `fugaedge-${label}-`)
  },

  async deleteBackup(path: string): Promise<void> {
    deleteFile(path)
  },
}

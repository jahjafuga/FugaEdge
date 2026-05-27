// Platform-agnostic backup storage contract.
//
// Pure interface — no fs / electron / sqlite imports — so it can be consumed
// by /src/core (the import-time trigger) and implemented per platform. The
// Electron implementation lives in electron/db/backup.ts; a future web port
// would supply a server-side blob-storage implementation. Per ARCHITECTURE.md
// Rule 8, native / platform capabilities sit behind an injectable interface
// like this one.

/** A backup file on disk (or wherever the platform stores it). */
export interface BackupRef {
  /** Absolute path of the backup file. */
  path: string
  /** Filename only. The embedded ISO-8601 timestamp makes a plain lexical
   *  sort of this field chronological. */
  name: string
}

/** Result of a completed backup write. */
export interface BackupResult extends BackupRef {
  /** Size of the written backup file, in bytes. */
  bytes: number
}

/** Database backup operations a host platform must provide. */
export interface BackupStorage {
  /**
   * Copy the live database to a new timestamped backup file labelled with
   * `label` (e.g. "pre-import"). Creates the backup location if needed.
   * Resolves with the new backup's ref + size. Rejects on any failure —
   * callers treat a rejection as "no backup was made".
   */
  backupDatabase(label: string): Promise<BackupResult>

  /**
   * List every existing backup written under `label`. Order is unspecified;
   * the caller sorts (by `name`, which is chronological).
   */
  listBackups(label: string): Promise<BackupRef[]>

  /** Delete one backup file by absolute path. */
  deleteBackup(path: string): Promise<void>
}

// Startup-failure copy, and the tagged error that earns it.
//
// openDatabase() is allowed to abort a launch for exactly ONE deliberate reason: the
// rule-breaks pre-migration backup lets a failed copy PROPAGATE, so a machine that cannot be
// backed up never advances its schema past the point where the migration is still reachable
// (electron/db/database.ts, maybeBackupForRuleBreaksBackfill). That throw is a designed
// fail-closed — and it is the one startup failure where we can honestly promise the user that
// their journal is untouched, because it fires BEFORE migrateBeforeSchema (which DROPs tables
// on an ancient DB), BEFORE db.exec(SCHEMA_SQL) (which re-stamps the schema version), and
// BEFORE any migration writes a single row.
//
// Every OTHER throw out of openDatabase — a corrupt file, SQLITE_CANTOPEN, a migration
// blowing up — arrives at the same handler with NO such guarantee: the schema may be
// half-applied. So the two get DIFFERENT copy, and the untagged path never claims the journal
// is safe. Telling a user "nothing was changed" when we do not know is worse than telling them
// nothing at all.
//
// Pure: no electron, no fs, no sqlite. The Electron seam lives in electron/main/startup.ts.

const BACKUP_FAILED_KIND = 'fugaedge/backup-failed'

export interface BackupFailedError extends Error {
  readonly kind: typeof BACKUP_FAILED_KIND
  readonly backupPath: string
}

/** TAG rather than subclass Error. A marker property survives every transpile target and every
 *  bundle boundary; `instanceof` across those does not, and a mis-identified error here would
 *  show the user the wrong promise about their data. */
export function backupFailedError(backupPath: string, cause: unknown): BackupFailedError {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const err = new Error(`pre-migration backup failed (${backupPath}): ${reason}`) as Error & {
    kind: typeof BACKUP_FAILED_KIND
    backupPath: string
  }
  err.name = 'BackupFailedError'
  err.kind = BACKUP_FAILED_KIND
  err.backupPath = backupPath
  return err
}

export function isBackupFailedError(e: unknown): e is BackupFailedError {
  return typeof e === 'object' && e !== null && (e as { kind?: unknown }).kind === BACKUP_FAILED_KIND
}

export interface BootFailureDialog {
  type: 'error'
  title: string
  message: string
  detail: string
  buttons: string[]
}

export function bootFailureDialog(err: unknown): BootFailureDialog {
  if (isBackupFailedError(err)) {
    return {
      type: 'error',
      title: 'FugaEdge could not start',
      message: 'FugaEdge could not back up your journal, so it has not updated it.',
      detail:
        'Your journal has not been changed. No trades or entries were modified, and nothing ' +
        'was lost.\n\n' +
        'FugaEdge always takes a full backup before it upgrades your journal, and it will not ' +
        'upgrade without one. Writing that backup failed — usually because the disk is full, or ' +
        'because another program (a backup or antivirus tool) is holding the FugaEdge folder ' +
        'open.\n\n' +
        'Free up some disk space, then open FugaEdge again. It will retry the backup and carry ' +
        'on from exactly where it stopped.\n\n' +
        `Details: ${err.message}`,
      buttons: ['Quit'],
    }
  }

  // No promise about the data on this path — see the header. We genuinely do not know.
  const reason = err instanceof Error ? (err.message ?? String(err)) : String(err)
  return {
    type: 'error',
    title: 'FugaEdge could not start',
    message: 'FugaEdge could not open your journal.',
    detail:
      'Something went wrong while opening your journal database.\n\n' +
      'Try opening FugaEdge again. If it keeps failing, your previous backups are in the ' +
      '"backups" folder inside the FugaEdge app-data folder.\n\n' +
      `Details: ${reason}`,
    buttons: ['Quit'],
  }
}

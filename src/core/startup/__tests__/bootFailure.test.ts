// The startup-failure copy, and the tagged error that earns it.
//
// THE LOAD-BEARING TEST in this file is the LAST describe block: a startup failure that is
// NOT the pre-migration backup must never tell the user their journal is unchanged. The
// backup throw fires before migrateBeforeSchema, before SCHEMA_SQL and before any migration
// writes a row, so there the promise is TRUE. On any other throw out of openDatabase the
// schema may be half-applied and we do not know — and "nothing was changed" is then a lie.

import { describe, expect, it } from 'vitest'
import {
  backupFailedError,
  isBackupFailedError,
  bootFailureDialog,
} from '../bootFailure'

const UNCHANGED = /has not been changed/i

describe('backupFailedError / isBackupFailedError', () => {
  it('tags the error so the startup handler can recognise it', () => {
    const err = backupFailedError('C:\\x\\backups\\fugaedge.db.pre-rule-breaks-backfill-1.bak', new Error('ENOSPC'))
    expect(isBackupFailedError(err)).toBe(true)
    expect(err.backupPath).toBe('C:\\x\\backups\\fugaedge.db.pre-rule-breaks-backfill-1.bak')
    expect(err.message).toContain('ENOSPC')
  })

  it('does NOT tag anything else', () => {
    expect(isBackupFailedError(new Error('disk full'))).toBe(false)
    expect(isBackupFailedError('disk full')).toBe(false)
    expect(isBackupFailedError(null)).toBe(false)
    expect(isBackupFailedError(undefined)).toBe(false)
    expect(isBackupFailedError({ kind: 'something-else' })).toBe(false)
  })

  it('survives a non-Error cause without throwing', () => {
    const err = backupFailedError('/tmp/x.bak', 'a bare string')
    expect(isBackupFailedError(err)).toBe(true)
    expect(err.message).toContain('a bare string')
  })
})

describe('bootFailureDialog — the BACKUP failure', () => {
  const dlg = bootFailureDialog(backupFailedError('/x/y.bak', new Error('ENOSPC: no space left on device')))

  it('is an error dialog the user can dismiss', () => {
    expect(dlg.type).toBe('error')
    expect(dlg.buttons.length).toBeGreaterThan(0)
    expect(dlg.title).toBeTruthy()
  })

  it('(1) says the BACKUP is what failed — not the journal', () => {
    expect(`${dlg.message} ${dlg.detail}`.toLowerCase()).toContain('back up')
  })

  it('(2) promises the journal is UNCHANGED — the whole point of failing before SCHEMA_SQL', () => {
    expect(dlg.detail).toMatch(UNCHANGED)
  })

  it('(3) says what to do: free up disk space, then reopen', () => {
    expect(dlg.detail.toLowerCase()).toContain('disk space')
    expect(dlg.detail.toLowerCase()).toMatch(/open fugaedge again|reopen|relaunch/)
  })

  it('carries the underlying cause so a support conversation is possible', () => {
    expect(dlg.detail).toContain('ENOSPC')
  })
})

describe('bootFailureDialog — ANY OTHER startup failure', () => {
  it('NEVER claims the journal is unchanged — on this path we do not know', () => {
    // A corrupt file, a failed migration, a SCHEMA_SQL error: the schema may be half-applied.
    // Reusing the backup copy here would be a comforting lie, which is worse than silence.
    for (const err of [
      new Error('SQLITE_CORRUPT: database disk image is malformed'),
      new Error('SQLITE_CANTOPEN: unable to open database file'),
      'a bare string',
      null,
    ]) {
      const dlg = bootFailureDialog(err)
      expect(dlg.detail).not.toMatch(UNCHANGED)
      expect(dlg.type).toBe('error')
      expect(dlg.buttons.length).toBeGreaterThan(0)
    }
  })

  it('still surfaces the underlying reason', () => {
    const dlg = bootFailureDialog(new Error('SQLITE_CORRUPT: database disk image is malformed'))
    expect(dlg.detail).toContain('SQLITE_CORRUPT')
  })
})

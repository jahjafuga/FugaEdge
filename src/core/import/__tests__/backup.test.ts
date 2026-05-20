import { describe, it, expect, vi } from 'vitest'
import type {
  BackupRef,
  BackupResult,
  BackupStorage,
} from '@/platform/backup-storage'
import {
  backupBeforeImport,
  MAX_PRE_IMPORT_BACKUPS,
  PRE_IMPORT_LABEL,
} from '../backup'

function result(name: string): BackupResult {
  return { name, path: `/backups/${name}`, bytes: 4096 }
}

function refs(names: string[]): BackupRef[] {
  return names.map((name) => ({ name, path: `/backups/${name}` }))
}

// Synthetic backup names whose ISO-timestamp segment sorts chronologically.
function names(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      `fugaedge-pre-import-2026-05-20T${String(i).padStart(2, '0')}-00-00-000Z.db`,
  )
}

describe('backupBeforeImport', () => {
  it('backs up under the pre-import label and returns the storage result', async () => {
    const made = result(names(1)[0])
    const storage: BackupStorage = {
      backupDatabase: vi.fn().mockResolvedValue(made),
      listBackups: vi.fn().mockResolvedValue(refs([made.name])),
      deleteBackup: vi.fn().mockResolvedValue(undefined),
    }
    const out = await backupBeforeImport(storage)
    expect(storage.backupDatabase).toHaveBeenCalledWith(PRE_IMPORT_LABEL)
    expect(out).toBe(made)
  })

  it('prunes the oldest when backups exceed the retention cap', async () => {
    const all = names(MAX_PRE_IMPORT_BACKUPS + 1) // one over the cap
    const storage: BackupStorage = {
      backupDatabase: vi.fn().mockResolvedValue(result(all[all.length - 1])),
      listBackups: vi.fn().mockResolvedValue(refs(all)),
      deleteBackup: vi.fn().mockResolvedValue(undefined),
    }
    await backupBeforeImport(storage)
    expect(storage.deleteBackup).toHaveBeenCalledTimes(1)
    expect(storage.deleteBackup).toHaveBeenCalledWith(`/backups/${all[0]}`)
  })

  it('does not prune when backups are at or below the cap', async () => {
    const all = names(MAX_PRE_IMPORT_BACKUPS)
    const storage: BackupStorage = {
      backupDatabase: vi.fn().mockResolvedValue(result(all[all.length - 1])),
      listBackups: vi.fn().mockResolvedValue(refs(all)),
      deleteBackup: vi.fn().mockResolvedValue(undefined),
    }
    await backupBeforeImport(storage)
    expect(storage.deleteBackup).not.toHaveBeenCalled()
  })

  it('propagates a backup-write failure so the import aborts', async () => {
    const storage: BackupStorage = {
      backupDatabase: vi.fn().mockRejectedValue(new Error('disk full')),
      listBackups: vi.fn(),
      deleteBackup: vi.fn(),
    }
    await expect(backupBeforeImport(storage)).rejects.toThrow('disk full')
    expect(storage.listBackups).not.toHaveBeenCalled()
  })

  it('tolerates a prune failure — the backup itself still succeeds', async () => {
    const all = names(MAX_PRE_IMPORT_BACKUPS + 1)
    const made = result(all[all.length - 1])
    const storage: BackupStorage = {
      backupDatabase: vi.fn().mockResolvedValue(made),
      listBackups: vi.fn().mockResolvedValue(refs(all)),
      deleteBackup: vi.fn().mockRejectedValue(new Error('permission denied')),
    }
    await expect(backupBeforeImport(storage)).resolves.toBe(made)
  })
})

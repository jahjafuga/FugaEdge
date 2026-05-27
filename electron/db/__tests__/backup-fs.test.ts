import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  buildResetTarget,
  copyDbFile,
  fileSafeTimestamp,
  renameFile,
} from '../backup-fs'

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('copyDbFile', () => {
  it('writes a byte-identical copy and reports the correct size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fuga-backup-'))
    try {
      const src = join(dir, 'source.db')
      const dest = join(dir, 'copy.db')
      // 8 KB of varied bytes — stands in for a real binary SQLite file.
      const payload = Buffer.from(
        Array.from({ length: 8192 }, (_, i) => (i * 31) % 256),
      )
      writeFileSync(src, payload)

      const bytes = copyDbFile(src, dest)

      expect(bytes).toBe(payload.byteLength)
      expect(sha256(dest)).toBe(sha256(src))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('renameFile', () => {
  it('moves the file — source gone, destination keeps the original bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fuga-reset-'))
    try {
      const src = join(dir, 'fugaedge.db')
      const dest = join(dir, 'fugaedge-reset-x.db')
      const payload = Buffer.from(
        Array.from({ length: 2048 }, (_, i) => (i * 7) % 256),
      )
      writeFileSync(src, payload)

      renameFile(src, dest)

      expect(existsSync(src)).toBe(false)
      expect(existsSync(dest)).toBe(true)
      expect(sha256(dest)).toBe(createHash('sha256').update(payload).digest('hex'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('fileSafeTimestamp', () => {
  it('emits a filename-safe ISO-8601 string with no colons or dots', () => {
    const ts = fileSafeTimestamp(new Date('2026-05-20T21:45:03.123Z'))
    expect(ts).toBe('2026-05-20T21-45-03-123Z')
    expect(ts).not.toMatch(/[:.]/)
  })
})

describe('buildResetTarget', () => {
  it('is a dated sibling of the database file, not inside backups/', () => {
    const dbPath = join('any', 'userData', 'fugaedge.db')
    const target = buildResetTarget(dbPath, new Date('2026-05-20T21:45:03.123Z'))
    // Same directory as the live DB — directly alongside it.
    expect(dirname(target)).toBe(dirname(dbPath))
    expect(basename(target)).toBe('fugaedge-reset-2026-05-20T21-45-03-123Z.db')
  })

  it('produces collision-free names for distinct timestamps (second reset)', () => {
    const dbPath = join('any', 'userData', 'fugaedge.db')
    const first = buildResetTarget(dbPath, new Date('2026-05-20T21:45:03.123Z'))
    const second = buildResetTarget(dbPath, new Date('2026-05-20T21:45:03.124Z'))
    expect(first).not.toBe(second)
  })
})

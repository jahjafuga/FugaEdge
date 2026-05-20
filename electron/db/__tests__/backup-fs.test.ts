import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyDbFile, fileSafeTimestamp } from '../backup-fs'

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

describe('fileSafeTimestamp', () => {
  it('emits a filename-safe ISO-8601 string with no colons or dots', () => {
    const ts = fileSafeTimestamp(new Date('2026-05-20T21:45:03.123Z'))
    expect(ts).toBe('2026-05-20T21-45-03-123Z')
    expect(ts).not.toMatch(/[:.]/)
  })
})

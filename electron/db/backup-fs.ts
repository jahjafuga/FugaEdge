// Filesystem primitives for database backup and reset — pure Node (node:fs /
// node:path only, no electron). Split out from the electron-coupled modules
// so the copy / rename / path logic can be unit tested without the electron
// module (a test importing backup.ts or reset.ts can't load — those import
// `electron` — but this file can).

import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { BackupRef } from '@/platform/backup-storage'

/**
 * Filename-safe ISO-8601 timestamp — `2026-05-20T21-45-03-123Z`. Colons and
 * the millisecond dot (illegal / awkward in filenames) become `-`; `T` and
 * `Z` are kept. Millisecond precision keeps consecutive files from
 * colliding. `at` is injectable for tests.
 */
export function fileSafeTimestamp(at: Date = new Date()): string {
  return at.toISOString().replace(/[:.]/g, '-')
}

/** Create `dir` (and parents) if missing. No-op when it already exists. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/**
 * Copy `src` to `dest`, returning the destination's size in bytes. This is
 * the single file-copy the backup feature performs — the binary-identity
 * acceptance criterion is proven against this function.
 */
export function copyDbFile(src: string, dest: string): number {
  copyFileSync(src, dest)
  return statSync(dest).size
}

/**
 * Rename (move) `src` to `dest`. Synchronous — the DB-reset caller needs the
 * move to complete before the next step (and before relaunch).
 */
export function renameFile(src: string, dest: string): void {
  renameSync(src, dest)
}

/**
 * Destination path for a "Reset journal" snapshot: a timestamped sibling of
 * the live database file —
 *   …/fugaedge.db  ->  …/fugaedge-reset-2026-05-20T21-45-03-123Z.db
 * Sits directly alongside the live DB (one level UP from the backups/
 * subfolder), per the Day 7.5 plan. `at` is injectable for tests.
 */
export function buildResetTarget(dbPath: string, at: Date = new Date()): string {
  return join(dirname(dbPath), `fugaedge-reset-${fileSafeTimestamp(at)}.db`)
}

/**
 * Every file in `dir` whose name starts with `prefix` and ends with `.db`,
 * as BackupRefs. Returns [] when `dir` does not exist yet (no backup has
 * ever been written).
 */
export function listBackupFiles(dir: string, prefix: string): BackupRef[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => n.startsWith(prefix) && n.endsWith('.db'))
    .map((n): BackupRef => ({ name: n, path: join(dir, n) }))
}

/** Delete a single file. */
export function deleteFile(path: string): void {
  unlinkSync(path)
}

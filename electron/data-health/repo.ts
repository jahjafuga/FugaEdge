import { openDatabase } from '../db/database'
import type { DataHealth } from '@shared/data-health-types'

// Storage keys in the settings table. Written by migrate-content-hash.ts
// (the count) and the data-health IPC handler (the acknowledged flag).
const KEYS = {
  collisions: 'content_hash_migration_collisions',
  acknowledged: 'content_hash_migration_collisions_acknowledged',
} as const

export function getDataHealth(): DataHealth {
  const db = openDatabase()
  const rows = db
    .prepare('SELECT key, value FROM settings WHERE key IN (?, ?)')
    .all(KEYS.collisions, KEYS.acknowledged) as { key: string; value: string }[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const raw = map[KEYS.collisions]
  const parsed = raw != null ? Number.parseInt(raw, 10) : 0
  const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  return {
    contentHashMigrationCollisions: count,
    contentHashMigrationCollisionsAcknowledged: map[KEYS.acknowledged] === 'true',
  }
}

export function acknowledgeContentHashCollisions(): DataHealth {
  const db = openDatabase()
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, 'true')
     ON CONFLICT(key) DO UPDATE SET value = 'true'`,
  ).run(KEYS.acknowledged)
  return getDataHealth()
}

// v0.2.5 Phase A — append-only XP ledger repo (spec §A3 / D12 / D18).
// Events are never revoked; total XP = SUM(xp); the UNIQUE idempotency_key
// is the entire dedup mechanism — both the reconciliation sweep and the
// inline hooks call insertXpEvents and rely on INSERT OR IGNORE, so
// replaying any batch of intents is always safe.

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import type { XpAwardIntent, XpEvent } from '@shared/xp-types'

const COLUMNS = 'id, event_type, source_ref, xp, idempotency_key, created_at'

/** Batch-insert award intents (INSERT OR IGNORE on idempotency_key, one
 *  transaction). Returns how many actually landed. */
export function insertXpEvents(intents: XpAwardIntent[]): number {
  if (intents.length === 0) return 0
  const db = openDatabase()
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO xp_events (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  let inserted = 0
  const tx = db.transaction(() => {
    for (const intent of intents) {
      const info = stmt.run(
        newUlid(),
        intent.event_type,
        intent.source_ref ?? null,
        intent.xp,
        intent.idempotency_key,
        new Date().toISOString(),
      )
      inserted += info.changes
    }
  })
  tx()
  return inserted
}

export function getXpTotal(): number {
  const db = openDatabase()
  const row = db
    .prepare('SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events')
    .get() as { total: number }
  return row.total
}

/** All idempotency keys, optionally filtered to a prefix (e.g. 'session:').
 *  The reconciliation sweep diffs these against computed intents. */
export function listIdempotencyKeys(prefix?: string): string[] {
  const db = openDatabase()
  const rows = (
    prefix
      ? db
          .prepare(
            'SELECT idempotency_key FROM xp_events WHERE idempotency_key LIKE ?',
          )
          .all(`${prefix}%`)
      : db.prepare('SELECT idempotency_key FROM xp_events').all()
  ) as { idempotency_key: string }[]
  return rows.map((r) => r.idempotency_key)
}

export function listXpEvents(opts: { sinceIso?: string } = {}): XpEvent[] {
  const db = openDatabase()
  if (opts.sinceIso) {
    return db
      .prepare(
        `SELECT ${COLUMNS} FROM xp_events WHERE created_at >= ? ORDER BY id ASC`,
      )
      .all(opts.sinceIso) as XpEvent[]
  }
  return db
    .prepare(`SELECT ${COLUMNS} FROM xp_events ORDER BY id ASC`)
    .all() as XpEvent[]
}

// ── Level floor (never-demote durability) ─────────────────────────────────
// A kv row in the existing settings table — the LEVEL integer of the highest
// level ever reached. Mirrors the settings single-row read + upsert idiom
// (data-health/repo.ts); additive, no schema migration. The pure rule lives in
// @/core/xp/floor; this is the storage only.

const LEVEL_FLOOR_KEY = 'xp_level_floor'

/** The stored highest-level floor, or null if never seeded. */
export function getLevelFloor(): number | null {
  const db = openDatabase()
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(LEVEL_FLOOR_KEY) as { value: string } | undefined
  if (!row) return null
  const n = Number.parseInt(row.value, 10)
  return Number.isFinite(n) ? n : null
}

/** Persist the level floor (upsert). Callers only ever raise it (monotonic). */
export function setLevelFloor(level: number): void {
  const db = openDatabase()
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(LEVEL_FLOOR_KEY, String(level))
}

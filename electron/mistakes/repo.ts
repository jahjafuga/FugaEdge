import { openDatabase } from '../db/database'
import type { MistakeAxis, MistakeDef, MistakeTag } from '@shared/mistakes-types'

// SQLite implementation of the mistakes API (schema-34 mistake_def + trade_mistake).
// Mirrors electron/playbook/repo.ts: openDatabase() + prepared statements, clean
// return types (MistakeDef[] / MistakeTag[] — never raw better-sqlite3 rows) so a
// future Postgres repo can swap in behind these signatures unchanged. The junction
// code is axis-blind; axis lives on mistake_def only. NO writes to mistake_def in
// this beat (vocabulary CRUD is beat 2b).

interface MistakeDefRowDb {
  id: number
  axis: string
  name: string
  sort_position: number
  is_custom: number
  is_archived: number
}

// Tolerate odd stored values without throwing: the CHECK constraint keeps axis to
// the two values, but clamp defensively to 'technical' for any unexpected string.
function toAxis(raw: string): MistakeAxis {
  return raw === 'psychological' ? 'psychological' : 'technical'
}

// Read the mistake vocabulary (mistake_def). Default excludes archived rows;
// ordered by axis then sort_position so the consumer can group by axis and render
// in display order. Axis grouping is the consumer's job — the repo just returns
// ordered rows. (The CRUD that writes mistake_def is beat 2b.)
export function listMistakeDefs(opts?: { includeArchived?: boolean }): MistakeDef[] {
  const db = openDatabase()
  const where = opts?.includeArchived ? '' : 'WHERE is_archived = 0'
  const rows = db
    .prepare(`
      SELECT id, axis, name, sort_position, is_custom, is_archived
      FROM mistake_def
      ${where}
      ORDER BY axis, sort_position
    `)
    .all() as MistakeDefRowDb[]
  return rows.map((r) => ({
    id: r.id,
    axis: toAxis(r.axis),
    name: r.name,
    sort_position: r.sort_position,
    is_custom: r.is_custom === 1,
    is_archived: r.is_archived === 1,
  }))
}

// Read a trade's mistake tags from the trade_mistake junction, projected as
// MistakeTag { id, axis, name } and ordered by axis, sort_position (mirror
// getPlaybookTagsForTrade). Archived defs ARE included here — a trade can carry a
// since-archived mistake, and dropping it would silently lose history.
export function getMistakeTagsForTrade(tradeId: number): MistakeTag[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT md.id, md.axis, md.name
      FROM trade_mistake tm
      JOIN mistake_def md ON md.id = tm.mistake_def_id
      WHERE tm.trade_id = ?
      ORDER BY md.axis, md.sort_position
    `)
    .all(tradeId) as { id: number; axis: string; name: string }[]
  return rows.map((r) => ({ id: r.id, axis: toAxis(r.axis), name: r.name }))
}

// Add a mistake tag (trade_mistake). Existence checks mirror addPlaybookTag's
// validation (the mistake_def must exist; the trade must exist), then
// INSERT OR IGNORE so re-adding the same (trade, mistake) pair is a benign,
// idempotent no-op — the composite PK swallows the duplicate. Axis-blind: the
// junction never branches on axis.
export function addMistakeTag(tradeId: number, mistakeDefId: number): void {
  const db = openDatabase()
  const def = db
    .prepare('SELECT id FROM mistake_def WHERE id = ?')
    .get(mistakeDefId) as { id: number } | undefined
  if (!def) throw new Error(`Mistake ${mistakeDefId} not found`)
  const trade = db
    .prepare('SELECT id FROM trades WHERE id = ?')
    .get(tradeId) as { id: number } | undefined
  if (!trade) throw new Error(`Trade ${tradeId} not found`)
  db.prepare(
    'INSERT OR IGNORE INTO trade_mistake (trade_id, mistake_def_id) VALUES (?, ?)',
  ).run(tradeId, mistakeDefId)
}

// Remove a mistake tag. Removing an absent (trade, mistake) pair deletes zero
// rows — a clean no-op, never an error (mirror removePlaybookTag).
export function removeMistakeTag(tradeId: number, mistakeDefId: number): void {
  const db = openDatabase()
  db.prepare(
    'DELETE FROM trade_mistake WHERE trade_id = ? AND mistake_def_id = ?',
  ).run(tradeId, mistakeDefId)
}

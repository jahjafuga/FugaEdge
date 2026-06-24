import { openDatabase } from '../db/database'
import type {
  CreateMistakeDefInput,
  DeleteMistakeDefResult,
  MistakeAxis,
  MistakeDef,
  MistakeDefIdInput,
  MistakeTag,
  RenameMistakeDefInput,
  ReorderMistakeDefsInput,
} from '@shared/mistakes-types'

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

// ── Beat 2b — vocabulary writes (mistake_def CRUD) ──────────────────────────

function rowToDef(r: MistakeDefRowDb): MistakeDef {
  return {
    id: r.id,
    axis: toAxis(r.axis),
    name: r.name,
    sort_position: r.sort_position,
    is_custom: r.is_custom === 1,
    is_archived: r.is_archived === 1,
  }
}

// Re-read one def by id — the write methods return the fresh row so the UI can
// refresh without a separate list call. Throws if the row is gone.
function getMistakeDefById(id: number): MistakeDef {
  const db = openDatabase()
  const r = db
    .prepare('SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE id = ?')
    .get(id) as MistakeDefRowDb | undefined
  if (!r) throw new Error(`Mistake ${id} not found`)
  return rowToDef(r)
}

// Create a custom vocabulary entry. is_custom = 1, is_archived = 0, landing at the
// end of its axis (MAX(sort_position) + 1). Trims the name and PRE-checks for a
// case-insensitive active duplicate in the axis (a clear, surfaceable error); the
// partial-unique index ux_mistake_def_axis_name_active is the DB-level backstop.
export function createMistakeDef(input: CreateMistakeDefInput): MistakeDef {
  const db = openDatabase()
  const name = input.name.trim()
  if (!name) throw new Error('Mistake name cannot be empty')
  const dup = db
    .prepare('SELECT id FROM mistake_def WHERE axis = ? AND lower(name) = lower(?) AND is_archived = 0')
    .get(input.axis, name) as { id: number } | undefined
  if (dup) throw new Error(`"${name}" already exists in ${input.axis}`)
  const max = db
    .prepare('SELECT MAX(sort_position) AS m FROM mistake_def WHERE axis = ?')
    .get(input.axis) as { m: number | null }
  const sortPosition = (max?.m ?? -1) + 1
  const info = db
    .prepare('INSERT INTO mistake_def (axis, name, sort_position, is_custom, is_archived) VALUES (?, ?, ?, 1, 0)')
    .run(input.axis, name, sortPosition)
  return getMistakeDefById(Number(info.lastInsertRowid))
}

// Rename a vocabulary entry (the id is stable, so historical trade links are
// untouched). Trims, bumps updated_at, PRE-checks for a same-axis case-insensitive
// duplicate excluding self.
export function renameMistakeDef(input: RenameMistakeDefInput): MistakeDef {
  const db = openDatabase()
  const name = input.name.trim()
  if (!name) throw new Error('Mistake name cannot be empty')
  const current = db
    .prepare('SELECT axis FROM mistake_def WHERE id = ?')
    .get(input.id) as { axis: string } | undefined
  if (!current) throw new Error(`Mistake ${input.id} not found`)
  const dup = db
    .prepare('SELECT id FROM mistake_def WHERE axis = ? AND lower(name) = lower(?) AND is_archived = 0 AND id != ?')
    .get(current.axis, name, input.id) as { id: number } | undefined
  if (dup) throw new Error(`"${name}" already exists in ${current.axis}`)
  db.prepare("UPDATE mistake_def SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, input.id)
  return getMistakeDefById(input.id)
}

// Reorder ONE axis: each id's array index becomes its new sort_position, in a
// single transaction. Validates that ordered_ids covers EXACTLY the axis's active
// rows (no missing / extra / foreign / duplicate ids) before writing anything.
export function reorderMistakeDefs(input: ReorderMistakeDefsInput): MistakeDef[] {
  const db = openDatabase()
  const active = db
    .prepare('SELECT id FROM mistake_def WHERE axis = ? AND is_archived = 0')
    .all(input.axis) as { id: number }[]
  const existing = new Set(active.map((r) => r.id))
  const given = new Set(input.ordered_ids)
  if (given.size !== input.ordered_ids.length) {
    throw new Error('ordered_ids contains duplicates')
  }
  if (given.size !== existing.size || [...existing].some((id) => !given.has(id))) {
    throw new Error(`ordered_ids must cover exactly the active ${input.axis} mistakes`)
  }
  const update = db.prepare(
    "UPDATE mistake_def SET sort_position = ?, updated_at = datetime('now') WHERE id = ? AND axis = ?",
  )
  const tx = db.transaction(() => {
    input.ordered_ids.forEach((id, index) => update.run(index, id, input.axis))
  })
  tx()
  const rows = db
    .prepare(
      'SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE axis = ? AND is_archived = 0 ORDER BY sort_position',
    )
    .all(input.axis) as MistakeDefRowDb[]
  return rows.map(rowToDef)
}

// Archive a vocabulary entry (works for any row — seeded or custom, attached or
// not). Hides it from active reads without deleting; trade links survive.
export function archiveMistakeDef(input: MistakeDefIdInput): MistakeDef {
  const db = openDatabase()
  db.prepare("UPDATE mistake_def SET is_archived = 1, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return getMistakeDefById(input.id)
}

// Un-archive a vocabulary entry. The partial-unique index covers ACTIVE rows only,
// so a name freed up and reused could collide — PRE-check for an active same-axis
// case-insensitive name (excluding self) and throw clearly before un-hiding.
export function unarchiveMistakeDef(input: MistakeDefIdInput): MistakeDef {
  const db = openDatabase()
  const row = db
    .prepare('SELECT axis, name FROM mistake_def WHERE id = ?')
    .get(input.id) as { axis: string; name: string } | undefined
  if (!row) throw new Error(`Mistake ${input.id} not found`)
  const collision = db
    .prepare('SELECT id FROM mistake_def WHERE axis = ? AND lower(name) = lower(?) AND is_archived = 0 AND id != ?')
    .get(row.axis, row.name, input.id) as { id: number } | undefined
  if (collision) {
    throw new Error(`Cannot un-archive: "${row.name}" is already active in ${row.axis}`)
  }
  db.prepare("UPDATE mistake_def SET is_archived = 0, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return getMistakeDefById(input.id)
}

// THE DELETE GUARD (enforced here, server-side, so no caller — web port, scripts,
// 2c — can bypass it): a row may be HARD-DELETED only if it is BOTH is_custom = 1
// AND has ZERO trade_mistake rows. Otherwise it is ARCHIVED instead, never deleted.
// We decide explicitly via a count BEFORE deleting; we never let the trade_mistake
// ON DELETE RESTRICT throw reach the caller.
export function deleteMistakeDef(input: MistakeDefIdInput): DeleteMistakeDefResult {
  const db = openDatabase()
  const row = db
    .prepare('SELECT is_custom FROM mistake_def WHERE id = ?')
    .get(input.id) as { is_custom: number } | undefined
  if (!row) throw new Error(`Mistake ${input.id} not found`)
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM trade_mistake WHERE mistake_def_id = ?')
    .get(input.id) as { n: number }
  if (row.is_custom === 1 && n === 0) {
    db.prepare('DELETE FROM mistake_def WHERE id = ?').run(input.id)
    return { deleted: true, archivedInstead: false }
  }
  db.prepare("UPDATE mistake_def SET is_archived = 1, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return { deleted: false, archivedInstead: true }
}

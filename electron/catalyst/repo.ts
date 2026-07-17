import { openDatabase } from '../db/database'
import type {
  CatalystDef,
  CatalystDefIdInput,
  CreateCatalystDefInput,
  DeleteCatalystDefResult,
  RenameCatalystDefInput,
  ReorderCatalystDefsInput,
} from '@shared/catalyst-types'

// SQLite implementation of the catalyst vocabulary API (the schema-35 catalyst_def
// table). Mirrors electron/mistakes/repo.ts: openDatabase() + prepared statements,
// clean return types (CatalystDef[] — never raw better-sqlite3 rows) so a future
// Postgres repo can swap in behind these signatures unchanged. Two divergences from
// the mistakes clone: NO axis (catalyst is a flat list) and NO junction — a trade
// stores its catalyst as a name STRING on trades.catalyst_type, so (1) renaming a
// def propagates the new name to those trades atomically, and (2) the delete guard
// counts usage by name against trades, not via a junction.

interface CatalystDefRowDb {
  id: number
  name: string
  sort_position: number
  is_custom: number
  is_archived: number
}

function rowToDef(r: CatalystDefRowDb): CatalystDef {
  return {
    id: r.id,
    name: r.name,
    sort_position: r.sort_position,
    is_custom: r.is_custom === 1,
    is_archived: r.is_archived === 1,
  }
}

// Re-read one def by id — the write methods return the fresh row so the UI can
// refresh without a separate list call. Throws if the row is gone.
function getCatalystDefById(id: number): CatalystDef {
  const db = openDatabase()
  const r = db
    .prepare('SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = ?')
    .get(id) as CatalystDefRowDb | undefined
  if (!r) throw new Error(`Catalyst ${id} not found`)
  return rowToDef(r)
}

// Read the catalyst vocabulary (catalyst_def). Default excludes archived rows;
// ordered by sort_position (no axis — catalyst is one flat list).
export function listCatalystDefs(opts?: { includeArchived?: boolean }): CatalystDef[] {
  const db = openDatabase()
  const where = opts?.includeArchived ? '' : 'WHERE is_archived = 0'
  const rows = db
    .prepare(`
      SELECT id, name, sort_position, is_custom, is_archived
      FROM catalyst_def
      ${where}
      ORDER BY sort_position
    `)
    .all() as CatalystDefRowDb[]
  return rows.map(rowToDef)
}

// Create a custom vocabulary entry. is_custom = 1, is_archived = 0, landing at the
// end of the list (MAX(sort_position) + 1). Trims the name and PRE-checks for a
// case-insensitive active duplicate (global — no axis); the partial-unique index
// ux_catalyst_def_name_active is the DB-level backstop.
export function createCatalystDef(input: CreateCatalystDefInput): CatalystDef {
  const db = openDatabase()
  const name = input.name.trim()
  if (!name) throw new Error('Catalyst name cannot be empty')
  // THE FINAL TWO (build B) — the dup check covers ARCHIVED rows too (the
  // silent history-merge hole; see renameCatalystDef).
  const dup = db
    .prepare('SELECT id, is_archived FROM catalyst_def WHERE lower(name) = lower(?)')
    .get(name) as { id: number; is_archived: number } | undefined
  if (dup) {
    throw new Error(
      dup.is_archived === 1
        ? `"${name}" already exists — archived; unarchive it instead`
        : `"${name}" already exists`,
    )
  }
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_position), -1) + 1 AS next FROM catalyst_def')
    .get() as { next: number }
  const info = db
    .prepare('INSERT INTO catalyst_def (name, sort_position, is_custom, is_archived) VALUES (?, ?, 1, 0)')
    .run(name, next)
  return getCatalystDefById(Number(info.lastInsertRowid))
}

// Rename a vocabulary entry. The id is stable, but unlike mistakes (where trades
// link by id), trades store the catalyst as a name STRING — so the rename also
// propagates the new name to every trade carrying the old name, in the SAME
// transaction. DELETION-BLIND: the trades UPDATE carries no deleted_at filter, so a
// trashed-but-restorable trade keeps a consistent name (mirrors the mistakes
// id-join, which is deletion-blind). Trims + PRE-checks a case-insensitive
// duplicate excluding self (global — no axis).
export function renameCatalystDef(input: RenameCatalystDefInput): CatalystDef {
  const db = openDatabase()
  const name = input.name.trim()
  if (!name) throw new Error('Catalyst name cannot be empty')
  const old = db
    .prepare('SELECT name FROM catalyst_def WHERE id = ?')
    .get(input.id) as { name: string } | undefined
  if (!old) throw new Error(`Catalyst ${input.id} not found`)
  // THE FINAL TWO (build B) — archived rows now collide too. This guard is the
  // one that matters most: the transaction below rewrites trades BY NAME, so a
  // rename onto an archived def's name would fuse two trade histories
  // irreversibly. The throw lands BEFORE the transaction — nothing is touched
  // on the blocked path.
  const dup = db
    .prepare('SELECT id, is_archived FROM catalyst_def WHERE lower(name) = lower(?) AND id != ?')
    .get(name, input.id) as { id: number; is_archived: number } | undefined
  if (dup) {
    throw new Error(
      dup.is_archived === 1
        ? `"${name}" already exists — archived; unarchive it instead`
        : `"${name}" already exists`,
    )
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE catalyst_def SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, input.id)
    db.prepare('UPDATE trades SET catalyst_type = ? WHERE catalyst_type = ?').run(name, old.name)
  })
  tx()
  return getCatalystDefById(input.id)
}

// Reorder the whole list: each id's array index becomes its new sort_position, in a
// single transaction. Validates that ordered_ids covers EXACTLY the active rows (no
// missing / extra / foreign / duplicate ids) before writing anything. No axis — one
// global ordered list.
export function reorderCatalystDefs(input: ReorderCatalystDefsInput): CatalystDef[] {
  const db = openDatabase()
  const active = db
    .prepare('SELECT id FROM catalyst_def WHERE is_archived = 0')
    .all() as { id: number }[]
  const existing = new Set(active.map((r) => r.id))
  const given = new Set(input.ordered_ids)
  if (given.size !== input.ordered_ids.length) {
    throw new Error('ordered_ids contains duplicates')
  }
  if (given.size !== existing.size || [...existing].some((id) => !given.has(id))) {
    throw new Error('ordered_ids must cover exactly the active catalysts')
  }
  const update = db.prepare(
    "UPDATE catalyst_def SET sort_position = ?, updated_at = datetime('now') WHERE id = ?",
  )
  const tx = db.transaction(() => {
    input.ordered_ids.forEach((id, index) => update.run(index, id))
  })
  tx()
  return listCatalystDefs()
}

// Archive a vocabulary entry (works for any row — seeded or custom, used or not).
// Hides it from active reads without deleting; trades keep their stored name.
export function archiveCatalystDef(input: CatalystDefIdInput): CatalystDef {
  const db = openDatabase()
  db.prepare("UPDATE catalyst_def SET is_archived = 1, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return getCatalystDefById(input.id)
}

// Un-archive a vocabulary entry. The partial-unique index covers ACTIVE rows only,
// so a name freed up and reused could collide — PRE-check for an active
// case-insensitive name (excluding self) and throw clearly before un-hiding.
export function unarchiveCatalystDef(input: CatalystDefIdInput): CatalystDef {
  const db = openDatabase()
  const row = db
    .prepare('SELECT name FROM catalyst_def WHERE id = ?')
    .get(input.id) as { name: string } | undefined
  if (!row) throw new Error(`Catalyst ${input.id} not found`)
  const collision = db
    .prepare('SELECT id FROM catalyst_def WHERE lower(name) = lower(?) AND is_archived = 0 AND id != ?')
    .get(row.name, input.id) as { id: number } | undefined
  if (collision) {
    throw new Error(`Cannot un-archive: "${row.name}" is already active`)
  }
  db.prepare("UPDATE catalyst_def SET is_archived = 0, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return getCatalystDefById(input.id)
}

// THE DELETE GUARD (enforced here, server-side): a row may be HARD-DELETED only if
// it is BOTH is_custom = 1 AND used by ZERO trades. Otherwise it is ARCHIVED instead,
// never deleted. Unlike mistakes (which counts a junction), catalyst counts trades
// BY NAME — trades store the catalyst as a name string. DELETION-BLIND: the count has
// no deleted_at filter, so a catalyst used only by a trashed (restorable) trade is
// archived, not deleted (mirrors the mistakes guard's deletion-blind junction count).
export function deleteCatalystDef(input: CatalystDefIdInput): DeleteCatalystDefResult {
  const db = openDatabase()
  const row = db
    .prepare('SELECT is_custom, name FROM catalyst_def WHERE id = ?')
    .get(input.id) as { is_custom: number; name: string } | undefined
  if (!row) throw new Error(`Catalyst ${input.id} not found`)
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM trades WHERE catalyst_type = ?')
    .get(row.name) as { n: number }
  if (row.is_custom === 1 && n === 0) {
    db.prepare('DELETE FROM catalyst_def WHERE id = ?').run(input.id)
    return { deleted: true, archivedInstead: false }
  }
  db.prepare("UPDATE catalyst_def SET is_archived = 1, updated_at = datetime('now') WHERE id = ?").run(input.id)
  return { deleted: false, archivedInstead: true }
}

// Shared, PURE mistake taxonomy types — the schema-34 two-axis model
// (mistake_def vocabulary + the trade_mistake junction). ZERO runtime imports
// (no electron / better-sqlite3 / react) so a future Postgres/web repo reuses
// these unchanged. Mirrors the playbook-confluence shapes (PlaybookTag /
// PlaybookTagInput); axis replaces tier, mistake_def_id replaces playbook_id.

export type MistakeAxis = 'technical' | 'psychological'

/** A vocabulary row from mistake_def. `is_custom` / `is_archived` are surfaced
 *  as booleans (the DB stores them as 0/1 integers). */
export interface MistakeDef {
  id: number
  axis: MistakeAxis
  name: string
  sort_position: number
  is_custom: boolean
  is_archived: boolean
}

/** A single mistake tag on a trade — a lightweight projection of the mistake_def
 *  joined from the trade_mistake junction (the PlaybookTag analog). `axis`
 *  carries the two-axis grouping; the junction itself stays axis-blind. */
export interface MistakeTag {
  id: number
  axis: MistakeAxis
  name: string
}

/** Add/remove a mistake tag on a trade (the trade_mistake junction). The
 *  PlaybookTagInput analog. */
export interface MistakeTagInput {
  trade_id: number
  mistake_def_id: number
}

/** Phase 2 bulk-retag — Add or Remove a set of mistakes across many trades.
 *  mode 'add' unions the def ids into each trade (INSERT OR IGNORE — keeps
 *  existing); 'remove' strips them (DELETE — leaves the rest). Keyed by
 *  mistake_def_id (the junction key), not (axis, name). */
export interface BulkSetMistakesInput {
  trade_ids: number[]
  mode: 'add' | 'remove'
  mistake_def_ids: number[]
}

// ── Beat 2b — vocabulary WRITE inputs (mistake_def CRUD). PURE shapes; the
//    SQLite write methods live in electron/mistakes/repo.ts behind them.

/** Create a custom vocabulary entry on an axis (lands at the end of that axis). */
export interface CreateMistakeDefInput {
  axis: MistakeAxis
  name: string
}

/** Rename a vocabulary entry. The id is stable — historical trade links are
 *  unaffected, which is the rename-safety. */
export interface RenameMistakeDefInput {
  id: number
  name: string
}

/** Reorder ONE axis: the full ordered list of that axis's ACTIVE ids. Each id's
 *  array index becomes its new sort_position. */
export interface ReorderMistakeDefsInput {
  axis: MistakeAxis
  ordered_ids: number[]
}

/** A single mistake_def id — for archive / unarchive / delete. */
export interface MistakeDefIdInput {
  id: number
}

/** Result of a delete attempt. The repo guard hard-deletes only a custom,
 *  unreferenced row; otherwise it archives instead (never deletes). Mirrors the
 *  playbook DeletePlaybookResult convention. */
export interface DeleteMistakeDefResult {
  deleted: boolean
  archivedInstead: boolean
}

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

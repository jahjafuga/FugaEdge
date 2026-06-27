// Shared, PURE catalyst-vocabulary types — the user-customizable catalyst_def
// table that supersedes the static CATALYST_TYPES constant. ZERO runtime imports
// (no electron / better-sqlite3 / react) so a future Postgres/web repo reuses
// these unchanged. Mirrors the mistake_def shapes (MistakeDef / CreateMistakeDefInput
// / ...) MINUS the axis (catalyst has no axis) and MINUS any junction: a trade
// stores its catalyst as a plain name string on trades.catalyst_type, never an id.

/** A vocabulary row from catalyst_def. `is_custom` / `is_archived` are surfaced
 *  as booleans (the DB stores them as 0/1 integers). */
export interface CatalystDef {
  id: number
  name: string
  sort_position: number
  is_custom: boolean
  is_archived: boolean
}

// ── Vocabulary WRITE inputs (catalyst_def CRUD). PURE shapes; the SQLite write
//    methods live in electron/catalyst/repo.ts behind them (a later beat).

/** Create a custom vocabulary entry (lands at the end of the list). */
export interface CreateCatalystDefInput {
  name: string
}

/** Rename a vocabulary entry. The id is stable, but note: trades store the
 *  catalyst as a name string, so a later beat decides whether a rename also
 *  propagates to existing trades. */
export interface RenameCatalystDefInput {
  id: number
  name: string
}

/** Reorder the whole list: the full ordered list of ACTIVE ids. Each id's array
 *  index becomes its new sort_position. */
export interface ReorderCatalystDefsInput {
  ordered_ids: number[]
}

/** A single catalyst_def id — for archive / unarchive / delete. */
export interface CatalystDefIdInput {
  id: number
}

/** Result of a delete attempt. The repo guard hard-deletes only a custom,
 *  unreferenced row; otherwise it archives instead (never deletes). Mirrors the
 *  mistake DeleteMistakeDefResult convention. */
export interface DeleteCatalystDefResult {
  deleted: boolean
  archivedInstead: boolean
}

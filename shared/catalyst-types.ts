// Shared, PURE catalyst-vocabulary types — the user-customizable catalyst_def
// table that supersedes the static CATALYST_TYPES constant. ZERO runtime imports
// (no electron / better-sqlite3 / react) so a future Postgres/web repo reuses
// these unchanged. Mirrors the mistake_def shapes (MistakeDef / CreateMistakeDefInput
// / ...) MINUS the axis (catalyst has no axis) and MINUS any junction: a trade
// stores its catalyst as a plain name string on trades.catalyst_type, never an id.

/** What KIND of thing a catalyst label denotes. Beat 1 (schema 49) — the semantic
 *  the vocabulary never carried, stored once where the label lives:
 *    'news'      a real external catalyst (earnings, FDA, PR, M&A, ...)
 *    'technical' a chart-driven setup, deliberately not a news event
 *    'none'      the user checked and there WAS no catalyst
 *  Consumers must key on THIS, never on a label literal — a user may rename any
 *  row, including the seeded 'Technical / No Catalyst'. Mirrors CATALYST_KINDS in
 *  electron/db/migrate-catalyst-kind.ts and the column's CHECK constraint. */
export type CatalystKind = 'news' | 'technical' | 'none'

/** A vocabulary row from catalyst_def. `is_custom` / `is_archived` are surfaced
 *  as booleans (the DB stores them as 0/1 integers). */
export interface CatalystDef {
  id: number
  name: string
  sort_position: number
  is_custom: boolean
  is_archived: boolean
  kind: CatalystKind
}

// ── Vocabulary WRITE inputs (catalyst_def CRUD). PURE shapes; the SQLite write
//    methods live in electron/catalyst/repo.ts behind them (a later beat).

/** Create a custom vocabulary entry (lands at the end of the list). `kind` is
 *  REQUIRED and has no default: a new entry must never inherit a silent assumption
 *  about whether it means "news happened" or "nothing happened". The editor blocks
 *  the save until one is chosen. */
export interface CreateCatalystDefInput {
  name: string
  kind: CatalystKind
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

/** Set an existing entry's kind. Separate from rename on purpose: renaming is about
 *  the user's wording and must NEVER change meaning (the rename-safety property the
 *  migration harness pins), so the two are distinct operations. */
export interface SetCatalystDefKindInput {
  id: number
  kind: CatalystKind
}

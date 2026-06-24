// Mistakes reshape beat 1a (schema 33 → 34) — two-axis mistakes taxonomy
// foundation. Two additive, idempotent changes, in one place:
//   1. NEW `mistake_def` vocabulary table — the user-customizable list of
//      mistake labels, split across two axes ('technical' | 'psychological').
//      Seeded with 10 defaults per axis, but ONLY on an empty table.
//   2. NEW `trade_mistake` junction — many-to-many between trades and
//      mistake_def rows (a trade can carry many mistakes across both axes).
//
// Like migrate-confluence-junction, this moves NO existing data — it only adds
// two tables, their indexes, and a guarded one-time seed — so it needs NO backup
// closure, NO settings latch, and NO version gate. It is registered
// UNCONDITIONALLY in migrateAfterSchema (runs every launch) and self-guards via
// CREATE … IF NOT EXISTS and a COUNT(*) seed-if-empty check. Extracted into its
// own type-only module purely so it's unit-testable under vitest (importing
// database.ts would load better-sqlite3's native binary, which can't load
// there — the same constraint the other migrate-*.ts modules work around).
//
// IDEMPOTENCY / FRESH-INSTALL note: because it runs every boot (not gated on
// priorVersion), fresh installs (priorVersion 0) are covered too — a version
// gate would silently skip them, leaving a new user with no vocabulary / no
// junction. The schema-34 bump is for release-tracking only; it does not gate
// this migration. NOTHING reads these tables yet — this beat is purely the
// additive foundation.
//
// SEED uses a SEED-IF-EMPTY check (COUNT(*) = 0), not a settings latch or
// INSERT OR IGNORE: the 20 defaults are inserted only when mistake_def is
// empty, so a user who later renames/archives/adds labels is never re-seeded or
// overwritten. Each row inserts only (axis, name, sort_position); is_custom,
// is_archived, and the timestamps take their column defaults.
//
// FK story: the junction declares FK on both columns under foreign_keys = ON
// (the executions / trade_technicals / trade_notes convention). trade_id uses
// ON DELETE CASCADE — deleting a trade clears its mistake links. mistake_def_id
// uses ON DELETE RESTRICT — a vocabulary row still referenced by any trade
// cannot be hard-deleted (the UI archives via is_archived instead).

import type Database from 'better-sqlite3'

/** The default vocabulary: 11 technical + 10 psychological labels, seeded only
 *  on an empty table. sort_position is the per-axis display order. ASCII labels
 *  (plain hyphen, no em-dash) so the stored values stay portable. */
const SEED: { axis: 'technical' | 'psychological'; name: string; sort_position: number }[] = [
  { axis: 'technical', sort_position: 0, name: 'MACD negative at entry' },
  { axis: 'technical', sort_position: 1, name: 'Entered below VWAP' },
  { axis: 'technical', sort_position: 2, name: 'Chased extension (too far from 9 EMA)' },
  { axis: 'technical', sort_position: 3, name: 'Bought into resistance / HOD overhead' },
  { axis: 'technical', sort_position: 4, name: 'No clear setup / forced trade' },
  { axis: 'technical', sort_position: 5, name: 'High-volume pullback (wanted low volume)' },
  { axis: 'technical', sort_position: 6, name: 'Back side of the move' },
  { axis: 'technical', sort_position: 7, name: 'Stop too wide / risk undefined' },
  { axis: 'technical', sort_position: 8, name: 'Added to a loser / averaged down' },
  { axis: 'technical', sort_position: 9, name: 'Float or RVOL criteria not met' },
  { axis: 'technical', sort_position: 10, name: 'Entered too early / before trigger' },
  { axis: 'psychological', sort_position: 0, name: 'FOMO - chased a runner' },
  { axis: 'psychological', sort_position: 1, name: 'Greed - held too long / moved target' },
  { axis: 'psychological', sort_position: 2, name: 'Revenge trade (after a loss)' },
  { axis: 'psychological', sort_position: 3, name: 'Jumped in because it was moving' },
  { axis: 'psychological', sort_position: 4, name: 'Cut winner too early (fear)' },
  { axis: 'psychological', sort_position: 5, name: 'Hold-and-hope (held a loser too long)' },
  { axis: 'psychological', sort_position: 6, name: 'Overconfidence after a win' },
  { axis: 'psychological', sort_position: 7, name: 'Gave back profits / overtraded' },
  { axis: 'psychological', sort_position: 8, name: 'Broke my own rules' },
  { axis: 'psychological', sort_position: 9, name: "Traded on tilt - didn't walk away" },
]

export function migrateMistakesTaxonomy(conn: Database.Database): void {
  // 1. Vocabulary table. axis is constrained to the two supported values. The
  //    partial-unique index below forbids two ACTIVE (is_archived = 0) rows with
  //    the same axis + case-insensitive name, while still letting an archived
  //    row coexist with a live re-creation. IF NOT EXISTS so it's a no-op boot.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS mistake_def (
      id            INTEGER PRIMARY KEY,
      axis          TEXT NOT NULL CHECK (axis IN ('technical','psychological')),
      name          TEXT NOT NULL,
      sort_position INTEGER NOT NULL DEFAULT 0,
      is_custom     INTEGER NOT NULL DEFAULT 0,
      is_archived   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  // Case-insensitive uniqueness among ACTIVE rows only (partial index).
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_mistake_def_axis_name_active
      ON mistake_def (axis, lower(name)) WHERE is_archived = 0
  `)
  // Ordered read within an axis ("list the technical mistakes in display order").
  conn.exec(`
    CREATE INDEX IF NOT EXISTS ix_mistake_def_axis_sort
      ON mistake_def (axis, sort_position)
  `)

  // 2. Junction — many-to-many trades / mistake_def. Composite PK (trade_id,
  //    mistake_def_id) makes each (trade, mistake) pair unique. trade_id
  //    cascades on trade delete; mistake_def_id is RESTRICT so a referenced
  //    vocabulary row can't be hard-deleted (archive instead). IF NOT EXISTS.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS trade_mistake (
      trade_id       INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      mistake_def_id INTEGER NOT NULL REFERENCES mistake_def(id) ON DELETE RESTRICT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (trade_id, mistake_def_id)
    )
  `)
  // Reverse-lookup index: "which trades carry mistake_def X".
  conn.exec(
    'CREATE INDEX IF NOT EXISTS ix_trade_mistake_def ON trade_mistake (mistake_def_id, trade_id)',
  )

  // 3. Seed the default vocabulary — ONLY when mistake_def is empty
  //    (seed-if-empty, not a latch). A user who later edits the list is never
  //    re-seeded. Inserts only (axis, name, sort_position); is_custom /
  //    is_archived / timestamps take their column defaults.
  const { n } = conn
    .prepare('SELECT COUNT(*) AS n FROM mistake_def')
    .get() as { n: number }
  if (n === 0) {
    const insert = conn.prepare(
      'INSERT INTO mistake_def (axis, name, sort_position) VALUES (?, ?, ?)',
    )
    for (const row of SEED) {
      insert.run(row.axis, row.name, row.sort_position)
    }
  }
}

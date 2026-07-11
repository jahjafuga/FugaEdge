// Catalyst-customizable beat 1 (schema 34 -> 35) — the user-customizable catalyst
// vocabulary foundation. One additive, idempotent change:
//   1. NEW `catalyst_def` vocabulary table — the editable/archivable list of
//      catalyst labels, seeded with 15 defaults but ONLY on an empty table.
//
// Mirrors migrate-mistakes-taxonomy MINUS the axis column and MINUS any junction:
// a trade keeps storing its catalyst as a plain name string on trades.catalyst_type
// (no trade_catalyst table), so this migration adds ONE table + its indexes + a
// guarded one-time seed — NO backup closure, NO settings latch, NO version gate.
// It is registered UNCONDITIONALLY in migrateAfterSchema (runs every launch) and
// self-guards via CREATE ... IF NOT EXISTS and a COUNT(*) seed-if-empty check.
// Extracted into its own type-only module purely so it's unit-testable under
// vitest (importing database.ts would load better-sqlite3's native binary, which
// can't load there — the same constraint the other migrate-*.ts modules work
// around).
//
// IDEMPOTENCY / FRESH-INSTALL note: because it runs every boot (not gated on
// priorVersion), fresh installs (priorVersion 0) are covered too — a version gate
// would silently skip them, leaving a new user with no catalyst vocabulary. The
// schema-35 bump is for release-tracking only; it does not gate this migration.
//
// catalyst_def IS NOW THE SOURCE OF TRUTH — it is read by the Settings vocabulary
// list (CatalystVocabularyEditor -> VocabularyEditor), the trade modal's picker
// (CatalystEditor), and the bulk picker (BulkSetCatalystModal). The static
// CATALYST_TYPES constant is dead. (An earlier revision of this comment claimed
// "NOTHING reads this table yet" long after that stopped being true, which made the
// seed-without-backfill below look harmless — it is not: see the schema-46 backfill
// in migrate-catalyst-backfill.ts, which recovers the catalyst values that were
// already on trades when this hardcoded seed landed.)
//
// SEED uses a SEED-IF-EMPTY check (COUNT(*) = 0), not a settings latch or
// INSERT OR IGNORE: the 15 defaults are inserted only when catalyst_def is empty,
// so a user who later renames/archives/adds labels is never re-seeded or
// overwritten. Each row inserts only (name, sort_position); is_custom, is_archived,
// and the timestamps take their column defaults (is_custom = 0: a default, but
// still editable/archivable).

import type Database from 'better-sqlite3'

/** The default catalyst vocabulary: 15 labels, seeded only on an empty table.
 *  sort_position is the display order. ASCII labels (plain slashes/hyphen, no
 *  em-dash) so the stored values stay portable. */
const SEED: { name: string; sort_position: number }[] = [
  { sort_position: 0, name: 'Earnings' },
  { sort_position: 1, name: 'FDA / Clinical' },
  { sort_position: 2, name: 'News / PR' },
  { sort_position: 3, name: 'Offering / Dilution' },
  { sort_position: 4, name: 'Partnership / Contract' },
  { sort_position: 5, name: 'M&A / Buyout' },
  { sort_position: 6, name: 'Short Squeeze' },
  { sort_position: 7, name: 'Uplisting' },
  { sort_position: 8, name: 'Halt Resume' },
  { sort_position: 9, name: 'AI News' },
  { sort_position: 10, name: 'Crypto News' },
  { sort_position: 11, name: 'Sympathy' },
  { sort_position: 12, name: 'Continuation' },
  { sort_position: 13, name: 'Technical / No Catalyst' },
  { sort_position: 14, name: 'Other' },
]

export function migrateCatalystVocabulary(conn: Database.Database): void {
  // 1. Vocabulary table. The partial-unique index below forbids two ACTIVE
  //    (is_archived = 0) rows with the same case-insensitive name, while still
  //    letting an archived row coexist with a live re-creation. No axis (catalyst
  //    is a flat list). IF NOT EXISTS so it's a no-op boot.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS catalyst_def (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      sort_position INTEGER NOT NULL DEFAULT 0,
      is_custom     INTEGER NOT NULL DEFAULT 0,
      is_archived   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  // Case-insensitive uniqueness among ACTIVE rows only (partial index). Global
  // (no axis) — a catalyst name is unique across the whole vocabulary.
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_catalyst_def_name_active
      ON catalyst_def (lower(name)) WHERE is_archived = 0
  `)
  // Ordered read ("list the catalysts in display order").
  conn.exec(`
    CREATE INDEX IF NOT EXISTS ix_catalyst_def_sort
      ON catalyst_def (sort_position)
  `)

  // 2. Seed the default vocabulary — ONLY when catalyst_def is empty
  //    (seed-if-empty, not a latch). A user who later edits the list is never
  //    re-seeded. Inserts only (name, sort_position); is_custom / is_archived /
  //    timestamps take their column defaults.
  const { n } = conn
    .prepare('SELECT COUNT(*) AS n FROM catalyst_def')
    .get() as { n: number }
  if (n === 0) {
    const insert = conn.prepare(
      'INSERT INTO catalyst_def (name, sort_position) VALUES (?, ?)',
    )
    for (const row of SEED) {
      insert.run(row.name, row.sort_position)
    }
  }
}

// Catalyst-as-a-pillar Beat 1 (schema 48 -> 49) — teach the vocabulary WHAT KIND of
// thing each catalyst is. One additive, idempotent change:
//   1. NEW `catalyst_def.kind` column — 'news' | 'technical' | 'none'.
//
// WHY. The DNA adherence module excluded catalyst from pass/fail on the stated
// grounds that "catalyst_type is a name or null, so there's no confirmed
// no-catalyst value to fail against". That was already untrue: seed row 13 is
// 'Technical / No Catalyst', shipped since schema 35, and it flows through
// Analytics, Compare and XP award D8 as a peer of 'Earnings'. The vocabulary knew
// the LABEL but not the MEANING, so nothing downstream could tell "I checked and
// there was no catalyst" apart from "this was a news catalyst". `kind` is that
// missing semantic, stored once where the label lives.
//
// DERIVE-FROM-DATA LAW. The no-catalyst row is located by its SEEDED NAME at
// migration time — never by id, never by ordinal. A user who already renamed that
// row owns their wording, and we must not guess which row they meant: in that case
// EVERY row stays 'news' and we log it. Guessing by id is precisely the class of
// bug that made the schema-35 seed leave orphans behind.
//
// IDEMPOTENCY. Self-guards on column presence, so it is registered unconditionally
// (the migrateCatalystVocabulary precedent) and is a no-op boot after the first
// run. The one-time derive fires ONLY in the run that adds the column — a later
// re-run must never re-stamp 'none' onto a row the user has since reclassified.
//
// Extracted into its own type-only module so it is testable against a real engine
// in electron/db/__tests__/catalyst-kind.inmemory.ts (`npm run test:catalyst-kind`);
// better-sqlite3's Electron ABI will not load under vitest.

import type Database from 'better-sqlite3'

/** The SEEDED name of the no-catalyst row (migrate-catalyst-vocabulary SEED[13]).
 *  Matched ONCE, at migration time, to derive that row's kind. Nothing downstream
 *  may match this literal — kind is the contract from here on. */
export const NO_CATALYST_SEED_NAME = 'Technical / No Catalyst'

/** The closed set. Mirrored by the CHECK constraint below and by CatalystKind in
 *  shared/catalyst-types.ts. */
export const CATALYST_KINDS = ['news', 'technical', 'none'] as const

export function migrateCatalystKind(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(catalyst_def)').all() as { name: string }[]
  if (cols.some((c) => c.name === 'kind')) return // already migrated — no-op boot

  // Additive column. DEFAULT 'news' so every existing row is non-null immediately
  // and no row is ever left unclassified. The CHECK pins the closed set at the
  // storage layer, so a bad write fails loudly instead of silently widening the
  // vocabulary's meaning.
  conn.exec(`
    ALTER TABLE catalyst_def
      ADD COLUMN kind TEXT NOT NULL DEFAULT 'news'
      CHECK (kind IN ('news','technical','none'))
  `)

  // One-time derive, BY NAME, from the data. Runs only here — inside the same
  // branch that added the column.
  const r = conn
    .prepare('UPDATE catalyst_def SET kind = ? WHERE name = ?')
    .run('none', NO_CATALYST_SEED_NAME)
  if (r.changes === 0) {
    console.info(
      `[FE db] catalyst-kind: seeded row "${NO_CATALYST_SEED_NAME}" not found — ` +
        'it was renamed or removed. Every row stays kind=news; the user can set ' +
        'kinds in Settings. NOTHING was guessed.',
    )
  }
}

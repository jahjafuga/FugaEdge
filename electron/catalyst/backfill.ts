// Orphan-catalyst backfill (catalyst-recovery Beat 1) — PURE core.
//
// THE BUG: schema-35 (migrate-catalyst-vocabulary) created catalyst_def and seeded 15 defaults from
// a HARDCODED list, backfilling NOTHING from the data. schema-36 (migrate-catalyst-legacy-strings)
// then normalized only two legacy strings — its "no other old-8 strings appear on trades" note was
// a probe of ONE dataset (the dev's) and is false for real users. So any trades.catalyst_type that
// matches no seeded/normalized name has NO vocabulary row: it still buckets in Analytics (which
// groups by the RAW string) but is invisible in Settings — un-renameable, un-archivable, and
// absent even from "Show archived". Confirmed in the wild: "Reverse Split" (18 trades) and
// "Offering" (the seed carries "Offering / Dilution", which is not the same string).
//
// RECOVERY MODEL = PRESERVE + ADD-ONLY. Each DISTINCT non-blank trades.catalyst_type with no
// case-insensitively matching catalyst_def row becomes a new ACTIVE (is_archived = 0),
// is_custom = 1 def carrying the VERBATIM (trimmed) trade string. trades.catalyst_type is NEVER
// modified — it was always correct; the vocabulary is what went missing.
//
// SIMPLER THAN THE MISTAKES BACKFILL, by construction: catalyst has no axis and no junction, so
// there is no dictionary, no categorisation judgment, and no uncategorized bucket — the trade's
// stored string IS the link (matched by name), so every orphan is mechanically recoverable.
//
// SCOPE IS DATA-DERIVED, NEVER HARDCODED. Enumerating from a fixed list is the very defect being
// repaired, so the orphans are read out of the data: whatever a given user actually tagged
// ("Reverse Split", "Offering", or something nobody has ever seen) is recovered on their machine.
//
// Electron-free (type-only better-sqlite3 import) so it is unit-testable against a real in-memory
// engine and reusable by a future Postgres repo. The version gate / settings latch / pre-migration
// backup live in the wrapper (electron/db/migrate-catalyst-backfill.ts), never here.

import type Database from 'better-sqlite3'

export interface CatalystBackfillReport {
  rowsCreated: number
  /** The verbatim names recovered, in insertion order. */
  recoveredNames: string[]
}

export function backfillOrphanCatalysts(db: Database.Database): CatalystBackfillReport {
  const report: CatalystBackfillReport = { rowsCreated: 0, recoveredNames: [] }

  // Orphans, straight from the data. TRIM so a padded '  Reverse Split  ' recovers as the name the
  // user meant rather than minting vocabulary with stray whitespace; blank/NULL are skipped.
  // The NOT EXISTS deliberately carries NO is_archived filter — "has a row at all", not "has an
  // active row". A catalyst the user DELIBERATELY archived must stay archived (Settings already
  // shows it under "Show archived" with Restore); resurrecting it as active would both override
  // that choice and collide with ux_catalyst_def_name_active.
  // DELETION-BLIND: no deleted_at filter — a trashed-but-restorable trade's catalyst is still
  // history worth recovering (mirrors the repo's delete guard and the mistakes backfill).
  const orphans = db
    .prepare(`
      SELECT DISTINCT TRIM(t.catalyst_type) AS name
      FROM trades t
      WHERE t.catalyst_type IS NOT NULL
        AND TRIM(t.catalyst_type) != ''
        AND NOT EXISTS (
          SELECT 1 FROM catalyst_def d
          WHERE lower(d.name) = lower(TRIM(t.catalyst_type))
        )
      ORDER BY name
    `)
    .all() as { name: string }[]

  if (orphans.length === 0) return report

  // Append after the existing list (the createCatalystDef convention).
  const { n } = db
    .prepare('SELECT COALESCE(MAX(sort_position), -1) + 1 AS n FROM catalyst_def')
    .get() as { n: number }
  const insert = db.prepare(
    'INSERT INTO catalyst_def (name, sort_position, is_custom, is_archived) VALUES (?, ?, 1, 0)',
  )

  // LOAD-BEARING: two orphan strings differing only in case (e.g. 'Offering' and 'offering') both
  // miss the def check above — SQLite's DISTINCT is case-sensitive — but they collide under the
  // partial-unique index ux_catalyst_def_name_active (UNIQUE on lower(name) WHERE is_archived = 0).
  // Inserting both would throw and roll the whole migration back, so the first (ORDER BY name, i.e.
  // deterministic) wins and the rest are skipped.
  const seen = new Set<string>()
  let sort = n
  for (const { name } of orphans) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    insert.run(name, sort++)
    report.rowsCreated++
    report.recoveredNames.push(name)
  }

  return report
}

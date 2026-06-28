// Catalyst-customizable beat 4a (schema 35 -> 36) — normalize the two legacy
// catalyst strings to the new seeded catalyst_def names. A pure DATA migration:
// two literal string-equality UPDATEs on trades.catalyst_type. It creates no
// table and seeds nothing (the catalyst_def vocabulary + seed shipped in beat 1).
//
// WHY: before the vocabulary, the modal wrote a static 8-string list; two of those
// were renamed in the schema-35 seed ("News" -> "News / PR", "FDA/Clinical" ->
// "FDA / Clinical"). Existing trades still carry the OLD strings, which no longer
// match a vocabulary name — so analytics would fragment them into separate buckets
// and a settings rename would never reach them. This one-shot normalizes them so
// every tagged trade lines up with a seeded def. (The probe found exactly these two
// strings on real data: News x24, FDA/Clinical x5; "Earnings" and "Other" already
// match the new names and are untouched; no other old-8 strings appear on trades.)
//
// PROPERTIES:
//   - IDEMPOTENT: after the first run no trade carries 'News' or 'FDA/Clinical', so
//     re-running matches zero rows. Safe to run every launch (it is unconditional,
//     not version-gated). The schema-36 bump is release-tracking only.
//   - DELETION-BLIND: no deleted_at filter, so trashed-but-restorable trades are
//     normalized too — consistent with the catalyst rename propagation.
//   - EXACT: two literal string-equality swaps, no fuzzy matching. Already-matching
//     strings ('Earnings', 'Other') match neither WHERE and stay untouched.
//
// Extracted into its own type-only module so it's unit-testable / sandbox-runnable
// without loading better-sqlite3's native binary under vitest (the migrate-*.ts
// convention).

import type Database from 'better-sqlite3'

export function migrateCatalystLegacyStrings(conn: Database.Database): void {
  const a = conn
    .prepare("UPDATE trades SET catalyst_type = 'News / PR' WHERE catalyst_type = 'News'")
    .run()
  const b = conn
    .prepare("UPDATE trades SET catalyst_type = 'FDA / Clinical' WHERE catalyst_type = 'FDA/Clinical'")
    .run()
  const n = a.changes + b.changes
  if (n > 0) {
    console.log(`[catalyst] migrated ${n} legacy catalyst string(s) to vocabulary names`)
  }
}

// Fee-truth Beat 1 (schema 49 -> 50) — split NSCC out of the pooled other-fees
// bucket into its own day_fees column. One additive, idempotent change.
//
// WHY. day_fees pooled ORF/OCC/NSCC/Acc/Clr/Misc into fee_other, and the import
// preview rendered NEITHER fee_other NOR fee_commission while total_fees included
// both. A user reconciling the table against his broker could not make the columns
// reach the Total, because two of its components were not on screen. NSCC is the
// one that is routinely non-zero, so it earns a named column; the rest stay pooled
// and are now rendered as "Other" so the visible sum is always the whole total.
//
// This moves NO data. Existing rows keep whatever is already in fee_other — their
// NSCC share is not recoverable after the fact, because the pool was summed at
// parse time and the components were never stored separately. Re-importing the
// source file repopulates both columns correctly. Back-dating a split we cannot
// derive would be inventing numbers, which is the one thing a fee ledger must
// never do.
//
// Idempotent + self-guarding on column presence (the migrateCatalystKind
// precedent, schema 49), so it is registered unconditionally and covers fresh
// installs too. Type-only Database import so it is testable without the native
// binary.

import type Database from 'better-sqlite3'

export function migrateDayFeesNscc(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(day_fees)').all() as { name: string }[]
  if (cols.length === 0) return // table not created yet — nothing to widen
  if (cols.some((c) => c.name === 'fee_nscc')) return // already migrated

  conn.exec('ALTER TABLE day_fees ADD COLUMN fee_nscc REAL NOT NULL DEFAULT 0')
}

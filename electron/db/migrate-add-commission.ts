// trades.commission — additive nullable column (Ocean One Beat 3c).
//
// Ocean One reports a separate "Comm" value Dave wants surfaced apart from the
// regulatory/clearing fees. It is a DISPLAY SLICE of total_fees: the parser
// already sums it INTO total_fees, and net_pnl = gross_pnl - total_fees is
// unchanged — so this adds no math, only a column to store the breakout.
//
// Like migrate-add-deleted-at this moves NO data and adds a single nullable
// column: NO backup closure, NO settings latch, NO version gate (SCHEMA_VERSION
// stays '33' — additive nullable columns get no bump). NULL = "no separate
// commission known" (the pre-existing DAS/Webull rows), which the UI renders as
// an em-dash, NOT a fabricated $0 — hence REAL with no DEFAULT. Idempotent
// PRAGMA-gated ALTER; own module so it's unit-testable under vitest (importing
// database.ts would load better-sqlite3's native binary, which can't load
// there). Called once per launch from migrateAfterSchema; the PRAGMA guard
// keeps it a no-op on every subsequent boot and on fresh installs (where
// SCHEMA_SQL already declares the column).

import type Database from 'better-sqlite3'

export function migrateAddCommission(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'commission')) {
    // Nullable, no DEFAULT — NULL means "not separately reported" (em-dash, not $0).
    conn.exec('ALTER TABLE trades ADD COLUMN commission REAL')
  }
}

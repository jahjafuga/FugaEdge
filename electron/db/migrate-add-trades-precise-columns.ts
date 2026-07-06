// trades.total_fees_precise + gross_pnl_precise — additive columns (precision
// pass, Beat B1 of 3, schema 40 -> 41).
//
// The complete precision pass fixes the round-then-sum aggregate drift on FEES
// and GROSS (net is deferred). trades.total_fees / gross_pnl are round2'd at
// parse (parse-ocean-one.ts:301 / build-round-trips.ts:223-224), so SUM(...)
// over the 2dp column drifts ~cents across a large import. These two columns
// will hold the FULL-PRECISION value (written in B2) so the aggregate sites (B3)
// can sum them; the 2dp columns stay the display / net source, untouched.
//
// Both MIRROR total_fees EXACTLY — REAL NOT NULL DEFAULT 0 (schema.ts:181) — so
// existing rows backfill to 0 (SQLite's documented ADD COLUMN semantics) and
// every current fee/pnl reader keeps working unchanged. Additive +
// non-destructive: NO backup, NO settings latch, NO version gate (the
// migrateAddDayFeesOoColumns / migrateAddCommission idiom). Idempotent
// PRAGMA-gated ALTER; own type-only module so it's unit-testable under vitest
// (importing database.ts would load better-sqlite3's native binary, which can't
// load there).
//
// ORDERING (load-bearing): registered in migrateAfterSchema AFTER
// migrateTradesRebuildDedup — that migration REBUILDS trades (create/copy/drop/
// rename) from a FIXED column list (migrate-trades-rebuild-dedup.ts:40-92), so
// adding these before it would drop them on the rebuild boot. The rebuild is
// gated by idx_trades_exec_hash_account (dormant on schema->=38 DBs) and takes a
// no-copy fast path on fresh installs, so running after means the columns land
// on the final shape and survive. Migration-only (NOT declared in SCHEMA_SQL's
// trades CREATE), mirroring the day_fees OO columns.

import type Database from 'better-sqlite3'

export function migrateAddTradesPreciseColumns(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  const has = (name: string) => cols.some((c) => c.name === name)
  // Mirror total_fees exactly (REAL NOT NULL DEFAULT 0) — existing rows read 0.
  if (!has('total_fees_precise')) {
    conn.exec('ALTER TABLE trades ADD COLUMN total_fees_precise REAL NOT NULL DEFAULT 0')
  }
  if (!has('gross_pnl_precise')) {
    conn.exec('ALTER TABLE trades ADD COLUMN gross_pnl_precise REAL NOT NULL DEFAULT 0')
  }
}

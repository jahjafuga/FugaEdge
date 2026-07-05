// day_fees.fee_commission + fee_other — additive columns (Ocean One fee-merge,
// Beat 1 of 2, schema 39 → 40).
//
// Option A routes Ocean One's per-row fees through the existing day_fees
// allocator (apply-fees.ts / allocate-fees.ts). day_fees carries
// fee_ecn/sec/finra/htb/cat but has NO slot for OO's separate Comm or its
// "other" bucket (ORF/OCC/NSCC/Acc/Clr/Misc); without these two the allocator
// would drop those dollars and net_pnl would stop tying to the broker file.
// Beat 2 wires the parser/allocator to them — this beat only adds the columns.
//
// Both MIRROR fee_ecn EXACTLY — REAL NOT NULL DEFAULT 0 (schema.ts:281) — so
// existing rows backfill to 0 (SQLite's documented ADD COLUMN semantics) and
// every fee-sum reader keeps working unchanged. Additive + non-destructive:
// NO backup, NO settings latch, NO version gate (the migrateAddCommission /
// migrateAddDeletedAt idiom). Idempotent PRAGMA-gated ALTER; own type-only
// module so it's unit-testable under vitest (importing database.ts would load
// better-sqlite3's native binary, which can't load there).
//
// ORDERING (load-bearing): registered in migrateAfterSchema AFTER
// migrateDayFeesAccount — that migration REBUILDS day_fees (create/copy/drop/
// rename) with a FIXED column list, so adding these before it would drop them
// on the rebuild boot. Running after means the columns land on the final
// (date, symbol, account_id) shape and survive.

import type Database from 'better-sqlite3'

export function migrateAddDayFeesOoColumns(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(day_fees)').all() as { name: string }[]
  const has = (name: string) => cols.some((c) => c.name === name)
  // Mirror fee_ecn exactly (REAL NOT NULL DEFAULT 0) — existing rows read 0.
  if (!has('fee_commission')) {
    conn.exec('ALTER TABLE day_fees ADD COLUMN fee_commission REAL NOT NULL DEFAULT 0')
  }
  if (!has('fee_other')) {
    conn.exec('ALTER TABLE day_fees ADD COLUMN fee_other REAL NOT NULL DEFAULT 0')
  }
}

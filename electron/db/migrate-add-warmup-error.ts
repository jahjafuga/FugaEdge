// v0.2.4 §K.1 — additive intraday_bars.warmup_error column.
//
// Records the error message of a warmup-bars fetch that THREW (network / rate-
// limit / auth) so runWarmupBackfill's eligibility predicate can RETRY transient
// failures while leaving legitimately-empty keys (holiday / out-of-coverage)
// locked. Beat 2.7's smoke proved the gap: 11 of 15 "empty" warmups were actually
// throttled throws that warmup_attempted_at then locked out of future launches.
// NULL = succeeded OR legit-empty (no retry); set = threw (retry-eligible).
// Idempotent PRAGMA-gated ALTER, no version gate, no backup — same idiom as
// migrate-add-warmup-attempted-at / migrate-add-warmup-bars. Type-only import so
// it's unit-testable under vitest. Called once per launch from migrateAfterSchema;
// legacy rows keep warmup_error NULL.

import type Database from 'better-sqlite3'

export function migrateAddWarmupError(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(intraday_bars)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'warmup_error')) {
    conn.exec('ALTER TABLE intraday_bars ADD COLUMN warmup_error TEXT')
  }
}

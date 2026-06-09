// v0.2.4 §K — additive intraday_bars.warmup_attempted_at column.
//
// Marks every attempted warmup-bars fetch (success, empty-result, OR error)
// with an ISO timestamp, so runWarmupBackfill's eligibility predicate can skip
// keys it has already tried — preventing a futile re-fetch loop for holiday-
// window / out-of-coverage dates that legitimately return no warmup bars.
// Idempotent PRAGMA-gated ALTER, no version gate, no backup — the same additive
// idiom as migrate-add-warmup-bars / migrate-add-deleted-at. Type-only import so
// it's unit-testable under vitest. Called once per launch from
// migrateAfterSchema; legacy rows keep warmup_attempted_at NULL, which the §K
// predicate treats as "never attempted." TEXT (not TIMESTAMP) to match the
// schema's ISO-timestamp columns — SQLite gives TIMESTAMP NUMERIC affinity,
// wrong for the ISO string (new Date().toISOString()) we store.

import type Database from 'better-sqlite3'

export function migrateAddWarmupAttemptedAt(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(intraday_bars)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'warmup_attempted_at')) {
    conn.exec('ALTER TABLE intraday_bars ADD COLUMN warmup_attempted_at TEXT')
  }
}

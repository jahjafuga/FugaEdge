// v0.2.4 — additive intraday_bars.warmup_bars column.
//
// Adds warmup_bars to intraday_bars: extended-hours bars from prior trading
// days fetched alongside the active day, so the MACD sub-pane (and any future
// multi-day-context features) have enough leading data to skip the EMA warmup
// gap. Idempotent PRAGMA-gated ALTER — the same additive, no-backup, no-version-
// gate pattern as migrate-add-deleted-at; extracted into a type-only module
// (no better-sqlite3 native import) so it's unit-testable under vitest. Called
// once per launch from migrateAfterSchema; legacy rows keep warmup_bars NULL,
// which parseBars maps to [] on read, so reads stay safe with no backfill here.

import type Database from 'better-sqlite3'

export function migrateAddWarmupBars(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(intraday_bars)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'warmup_bars')) {
    conn.exec('ALTER TABLE intraday_bars ADD COLUMN warmup_bars TEXT')
  }
}

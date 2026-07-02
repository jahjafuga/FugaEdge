// Multi-account Beat 4 — re-key daily_summary from PK (date) to
// PK (date, account_id) so the per-day cache holds one row per account. The
// day_fees rebuild's exact mirror: shape gate (PRAGMA table_info — column
// present means done), existing rows assigned to the default account resolved
// via the conn directly (defensive 'Main account' provisioning when rows
// exist with no default anywhere), ONE transaction, logged summary.
// daily_summary has NO inbound FKs and no secondary index, so this is the
// plain create/copy/drop/rename dance. Registered in migrateAfterSchema AFTER
// migrateDayFeesAccount; NO version bump (the day_fees call). Type-only
// better-sqlite3 import (migrate-*.ts convention).

import type Database from 'better-sqlite3'
import { newUlid } from '@/core/ids/ulid'

const CREATE_DAILY_SUMMARY_NEW = `
CREATE TABLE daily_summary_new (
  date          TEXT    NOT NULL,
  total_pnl     REAL    NOT NULL DEFAULT 0,
  total_fees    REAL    NOT NULL DEFAULT 0,
  trade_count   INTEGER NOT NULL DEFAULT 0,
  winners       INTEGER NOT NULL DEFAULT 0,
  losers        INTEGER NOT NULL DEFAULT 0,
  gross_pnl     REAL    NOT NULL DEFAULT 0,
  largest_win   REAL    NOT NULL DEFAULT 0,
  largest_loss  REAL    NOT NULL DEFAULT 0,
  account_id    TEXT    NOT NULL REFERENCES accounts(id),
  PRIMARY KEY (date, account_id)
)`

export function migrateDailySummaryAccount(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(daily_summary)').all() as { name: string }[]
  if (cols.some((c) => c.name === 'account_id')) return // already re-keyed

  let moved = 0
  let createdMain = false
  let targetId: string | null = null

  const tx = conn.transaction(() => {
    targetId =
      (
        conn.prepare('SELECT id FROM accounts WHERE is_default = 1').get() as
          | { id: string }
          | undefined
      )?.id ?? null
    const rows =
      (
        conn.prepare('SELECT COUNT(*) AS n FROM daily_summary').get() as
          | { n: number }
          | undefined
      )?.n ?? 0

    if (rows > 0 && !targetId) {
      // Defensive — unreachable when the trades backfill ran first, but a
      // cache row must never block the boot.
      targetId = newUlid()
      conn
        .prepare(
          `INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(targetId, 'Main account', null, 'margin', null, 'active', 1, new Date().toISOString())
      createdMain = true
    }

    conn.exec(CREATE_DAILY_SUMMARY_NEW)
    moved = conn
      .prepare(
        `INSERT INTO daily_summary_new (date, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss, account_id)
         SELECT date, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss, ? FROM daily_summary`,
      )
      .run(targetId).changes
    conn.exec('DROP TABLE daily_summary')
    conn.exec('ALTER TABLE daily_summary_new RENAME TO daily_summary')
  })
  tx()

  console.info(
    `[FE migrate] daily-summary-account: re-keyed to PK (date, account_id) — ` +
      `${createdMain ? "created 'Main account' + " : ''}${moved} summary row(s) assigned` +
      (targetId ? ` to account ${targetId}` : ''),
  )
}

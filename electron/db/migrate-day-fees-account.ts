// Multi-account Beat 2 — rebuild day_fees from PK (date, symbol) to
// PK (date, symbol, account_id) so two trading accounts' fee files can
// coexist for the same day and symbol. The journal-rules mirror: a cheap
// shape gate (PRAGMA table_info — column present means done), ONE
// transaction, logged summary. Existing rows are assigned to the default
// account resolved via the conn directly (the Beat 1 backfill's own
// pattern — migrations never import repos); if fee rows exist with no
// default anywhere (unreachable via repo paths), 'Main account' is
// provisioned defensively. SQLite requires a table rebuild to change a
// PRIMARY KEY — day_fees has no inbound FKs and trivial volume, so this is
// the plain create/copy/drop/rename dance with no pragma bracketing needed.
// Registered in migrateAfterSchema AFTER the trades rebuild. Type-only
// better-sqlite3 import (migrate-*.ts convention).

import type Database from 'better-sqlite3'
import { newUlid } from '@/core/ids/ulid'

const CREATE_DAY_FEES_NEW = `
CREATE TABLE day_fees_new (
  date        TEXT    NOT NULL,
  symbol      TEXT    NOT NULL,
  fee_ecn     REAL    NOT NULL DEFAULT 0,
  fee_sec     REAL    NOT NULL DEFAULT 0,
  fee_finra   REAL    NOT NULL DEFAULT 0,
  fee_htb     REAL    NOT NULL DEFAULT 0,
  fee_cat     REAL    NOT NULL DEFAULT 0,
  total_fees  REAL    NOT NULL DEFAULT 0,
  source      TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  account_id  TEXT    NOT NULL REFERENCES accounts(id),
  PRIMARY KEY (date, symbol, account_id)
)`

export function migrateDayFeesAccount(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(day_fees)').all() as { name: string }[]
  if (cols.some((c) => c.name === 'account_id')) return // already rebuilt

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
        conn.prepare('SELECT COUNT(*) AS n FROM day_fees').get() as
          | { n: number }
          | undefined
      )?.n ?? 0

    if (rows > 0 && !targetId) {
      // Defensive — fee rows can predate trades (parked fees), so the trades
      // backfill may not have provisioned anything yet.
      targetId = newUlid()
      conn
        .prepare(
          `INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(targetId, 'Main account', null, 'margin', null, 'active', 1, new Date().toISOString())
      createdMain = true
    }

    conn.exec(CREATE_DAY_FEES_NEW)
    moved = conn
      .prepare(
        `INSERT INTO day_fees_new (date, symbol, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees, source, created_at, account_id)
         SELECT date, symbol, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees, source, created_at, ? FROM day_fees`,
      )
      .run(targetId).changes
    conn.exec('DROP TABLE day_fees')
    conn.exec('ALTER TABLE day_fees_new RENAME TO day_fees')
    conn.exec('CREATE INDEX IF NOT EXISTS idx_day_fees_date ON day_fees(date)')
  })
  tx()

  console.info(
    `[FE migrate] day-fees-account: rebuilt to PK (date, symbol, account_id) — ` +
      `${createdMain ? "created 'Main account' + " : ''}${moved} fee row(s) assigned` +
      (targetId ? ` to account ${targetId}` : ''),
  )
}

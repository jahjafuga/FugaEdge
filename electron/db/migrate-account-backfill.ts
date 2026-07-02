// Multi-account Beat 1 — assign every account-less trade to the default
// trading account, provisioning 'Main account' when the registry is empty.
// The journal-rules migration's mirror: a cheap shape-detection predicate
// gates the work (idempotent — a second boot finds nothing), the mutation
// rides ONE transaction (all-or-nothing), and a summary line is logged.
//
// The predicate and the assignment deliberately cover SOFT-DELETED rows too
// (no deleted_at filter): a trashed trade restored later must come back
// already carrying an account, not resurrect a NULL.
//
// Registered UNCONDITIONALLY in migrateAfterSchema (runs every launch), after
// the trades.account_id additive ALTER. NO SCHEMA_VERSION bump — the
// journal-rules/catalyst convention (the predicate is the gate, not a
// version). Type-only better-sqlite3 import so the body is unit-testable
// under vitest (the migrate-*.ts convention).

import type Database from 'better-sqlite3'
import { newUlid } from '@/core/ids/ulid'

const DEFAULT_ACCOUNT_NAME = 'Main account'

export function migrateAccountBackfill(conn: Database.Database): void {
  const pending =
    (
      conn
        .prepare('SELECT COUNT(*) AS n FROM trades WHERE account_id IS NULL')
        .get() as { n: number } | undefined
    )?.n ?? 0
  if (pending === 0) return // nothing account-less — idempotent no-op

  let createdMain = false
  let assigned = 0
  let targetId = ''

  const tx = conn.transaction(() => {
    // 1) Resolve the default account: use the existing default; create
    //    'Main account' on an empty registry; defensively promote the
    //    earliest active account if rows exist with no default (unreachable
    //    via repo paths — the repo rejects archiving/deleting the default).
    const existingDefault = conn
      .prepare('SELECT id FROM accounts WHERE is_default = 1')
      .get() as { id: string } | undefined
    if (existingDefault) {
      targetId = existingDefault.id
    } else {
      const count =
        (
          conn.prepare('SELECT COUNT(*) AS n FROM accounts').get() as
            | { n: number }
            | undefined
        )?.n ?? 0
      if (count === 0) {
        targetId = newUlid()
        conn
          .prepare(
            `INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(targetId, DEFAULT_ACCOUNT_NAME, null, 'margin', null, 'active', 1, new Date().toISOString())
        createdMain = true
      } else {
        const earliest = conn
          .prepare(
            "SELECT id FROM accounts WHERE status = 'active' ORDER BY created_at ASC LIMIT 1",
          )
          .get() as { id: string } | undefined
        if (!earliest) {
          // Every row archived and none default — doubly unreachable; refuse
          // to guess. The predicate re-fires next boot once repaired.
          console.warn(
            '[FE migrate] account-backfill: registry has rows but no default and no active account — skipping',
          )
          return
        }
        console.warn(
          '[FE migrate] account-backfill: no default account with a non-empty registry — promoting the earliest active account',
        )
        conn.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(earliest.id)
        targetId = earliest.id
      }
    }

    // 2) Assign every NULL-account trade (soft-deleted included) to it.
    assigned = conn
      .prepare('UPDATE trades SET account_id = ? WHERE account_id IS NULL')
      .run(targetId).changes
  })
  tx()

  if (assigned > 0) {
    console.info(
      `[FE migrate] account-backfill: ${
        createdMain ? `created '${DEFAULT_ACCOUNT_NAME}' + ` : ''
      }assigned ${assigned} trade(s) to account ${targetId}`,
    )
  }
}

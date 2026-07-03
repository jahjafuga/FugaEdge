// Stage 3 beat 1 — the balance reader. MIRRORS goals/equity.ts (the >= anchor
// convention; the money-track sim semantics of 4703a10) and imports NOTHING
// from goals/. balance = starting + deposits - withdrawals + net P&L, with
// ONE ANCHOR governing all three sums: each filters date >= the starting
// row's date, so pre-anchor events and pre-anchor trades never count.
//
// No starting row -> NULL, never 0 (the no-fabricated-data law). The
// combined roll-up excludes sim AT THE READER LEVEL (account selection —
// sim accounts keep their own practice ledger via balanceForAccount),
// INCLUDES archived non-sim accounts (archiving is decluttering, not a cash
// event), and COMPOSES per-account balances — each account's P&L runs from
// its own anchor, which a single walled SUM cannot express.

import { openDatabase } from '../db/database'
import type { AccountBalance, CombinedBalance } from '@shared/cash-types'

function sumSince(
  db: ReturnType<typeof openDatabase>,
  sql: string,
  accountId: string,
  anchor: string,
): number {
  const row = db.prepare(sql).get(accountId, anchor) as { total: number } | undefined
  return row?.total ?? 0
}

export function balanceForAccount(accountId: string): AccountBalance | null {
  const db = openDatabase()
  const startingRow = db
    .prepare(
      "SELECT amount, date FROM cash_events WHERE account_id = ? AND kind = 'starting'",
    )
    .get(accountId) as { amount: number; date: string } | undefined
  if (!startingRow) return null

  const anchor = startingRow.date
  const deposits = sumSince(
    db,
    `SELECT COALESCE(SUM(amount), 0) AS total FROM cash_events
     WHERE account_id = ? AND kind = 'deposit' AND date >= ?`,
    accountId,
    anchor,
  )
  const withdrawals = sumSince(
    db,
    `SELECT COALESCE(SUM(amount), 0) AS total FROM cash_events
     WHERE account_id = ? AND kind = 'withdrawal' AND date >= ?`,
    accountId,
    anchor,
  )
  const netPnl = sumSince(
    db,
    `SELECT COALESCE(SUM(net_pnl), 0) AS total FROM trades
     WHERE deleted_at IS NULL AND account_id = ? AND date >= ?`,
    accountId,
    anchor,
  )

  return {
    account_id: accountId,
    anchor_date: anchor,
    starting: startingRow.amount,
    deposits,
    withdrawals,
    net_pnl: netPnl,
    balance: startingRow.amount + deposits - withdrawals + netPnl,
  }
}

export function combinedBalance(): CombinedBalance {
  const db = openDatabase()
  // Reader-level sim wall: practice never enters the combined money view.
  // Deliberately NO status filter — archived non-sim accounts count.
  const rows = db
    .prepare("SELECT id FROM accounts WHERE account_type != 'sim'")
    .all() as { id: string }[]

  let total = 0
  const missingAnchor: string[] = []
  for (const r of rows) {
    const b = balanceForAccount(r.id)
    if (b === null) {
      missingAnchor.push(r.id)
    } else {
      total += b.balance
    }
  }
  return { total, missing_anchor: missingAnchor }
}

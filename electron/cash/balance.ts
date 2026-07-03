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
import type { AccountScope } from '@shared/accounts-types'
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

/** The per-account anchor row — shared by the point reader and the series
 *  reader (beat 3 factoring; the point sums themselves stay byte-same). */
function readStarting(
  db: ReturnType<typeof openDatabase>,
  accountId: string,
): { amount: number; date: string } | undefined {
  return db
    .prepare(
      "SELECT amount, date FROM cash_events WHERE account_id = ? AND kind = 'starting'",
    )
    .get(accountId) as { amount: number; date: string } | undefined
}

export function balanceForAccount(accountId: string): AccountBalance | null {
  const db = openDatabase()
  const startingRow = readStarting(db, accountId)
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

/** The 'all'-scope account selection — the reader-level sim wall.
 *  Deliberately NO status filter: archived non-sim accounts count. Shared
 *  by the roll-up and the series (beat 3 factoring). */
function nonSimAccountIds(db: ReturnType<typeof openDatabase>): string[] {
  const rows = db
    .prepare("SELECT id FROM accounts WHERE account_type != 'sim'")
    .all() as { id: string }[]
  return rows.map((r) => r.id)
}

export function combinedBalance(): CombinedBalance {
  const db = openDatabase()
  let total = 0
  const missingAnchor: string[] = []
  for (const id of nonSimAccountIds(db)) {
    const b = balanceForAccount(id)
    if (b === null) {
      missingAnchor.push(id)
    } else {
      total += b.balance
    }
  }
  return { total, missing_anchor: missingAnchor }
}

/** One point per activity day. The last point ALWAYS equals the point
 *  readers for the same scope to the cent (pinned in test). */
export interface BalancePoint {
  date: string
  balance: number
}

function easternToday(): string {
  // The trades.date convention is the Eastern trading day (schema.ts) —
  // the series' flat tail ends on that same calendar.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * The balance-over-time series: ordered daily points from the scope's
 * earliest anchor to today, under the SAME laws as the point readers —
 * one anchor per account governs every delta (date >= anchor), trades read
 * with deleted_at IS NULL + the account bind (identical semantics GROUP BY
 * date — never a second source), sim walled from 'all' at the account
 * selection, archived non-sim included, unanchored accounts contributing
 * nothing. No anchors in scope -> empty series (the honest empty state).
 */
export function balanceSeries(scope: AccountScope = 'all'): BalancePoint[] {
  const db = openDatabase()
  const ids = scope === 'all' ? nonSimAccountIds(db) : [scope.accountId]

  // Per-date deltas across all anchored accounts in scope. Each account's
  // events (starting + deposits - withdrawals, signed in SQL) and trade
  // P&L fold into one date->delta map from ITS OWN anchor.
  const deltas = new Map<string, number>()
  const add = (date: string, delta: number) => {
    deltas.set(date, (deltas.get(date) ?? 0) + delta)
  }
  let anyAnchor = false

  for (const id of ids) {
    const starting = readStarting(db, id)
    if (!starting) continue // unanchored: contributes nothing (coverage)
    anyAnchor = true
    const anchor = starting.date

    const eventRows = db
      .prepare(
        `SELECT date, SUM(CASE WHEN kind = 'withdrawal' THEN -amount ELSE amount END) AS delta
         FROM cash_events WHERE account_id = ? AND date >= ? GROUP BY date`,
      )
      .all(id, anchor) as { date: string; delta: number }[]
    for (const r of eventRows) add(r.date, r.delta)

    // Identical trades semantics to the point reader, grouped by day.
    const tradeRows = db
      .prepare(
        `SELECT date, SUM(net_pnl) AS delta FROM trades
         WHERE deleted_at IS NULL AND account_id = ? AND date >= ? GROUP BY date`,
      )
      .all(id, anchor) as { date: string; delta: number }[]
    for (const r of tradeRows) add(r.date, r.delta)
  }

  if (!anyAnchor) return []

  const points: BalancePoint[] = []
  let running = 0
  for (const date of [...deltas.keys()].sort()) {
    running += deltas.get(date)!
    points.push({ date, balance: running })
  }

  // The flat tail: the series runs to today even when the last activity is
  // older (the chart's right edge is NOW, not the last event).
  const today = easternToday()
  if (points.length > 0 && points[points.length - 1].date < today) {
    points.push({ date: today, balance: points[points.length - 1].balance })
  }
  return points
}

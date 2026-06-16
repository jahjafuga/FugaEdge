// v0.2.5 Fix 2(a) — pure session-summary aggregator. Sums a session's trade rows
// into the net/gross/fees totals + winner/loser counts the dashboard's
// latest-session payload needs, so readLatestSession can source those from the
// trades it ALREADY loads instead of the daily_summary cache — eliminating the
// two-sources-of-truth split for the most visible surface. PURE (ARCHITECTURE
// #1): zero electron / fs / DB imports; runs identically on the future Next.js +
// Postgres port. Winners/losers use the shared scratch classifier (isWin/isLoss
// over SCRATCH_EPSILON) so the counts match recompute-summary.ts's daily_summary
// semantics exactly — same boundary, same scratch handling.

import { isWin, isLoss } from '@/core/classify/outcome'

/** The minimal per-trade fields the summary needs. The dashboard's rawTrades row
 *  (a superset) is structurally assignable. */
export interface SessionTradeRow {
  net_pnl: number
  gross_pnl: number
  total_fees: number
}

export interface SessionSummary {
  net_pnl: number
  gross_pnl: number
  total_fees: number
  winners: number
  losers: number
}

export function summarizeSession(trades: readonly SessionTradeRow[]): SessionSummary {
  let net_pnl = 0
  let gross_pnl = 0
  let total_fees = 0
  let winners = 0
  let losers = 0
  for (const t of trades) {
    net_pnl += t.net_pnl
    gross_pnl += t.gross_pnl
    total_fees += t.total_fees
    // Same boundary as recompute-summary.ts (sqlIsWin/sqlIsLoss): a scratch
    // (|net_pnl| ≤ SCRATCH_EPSILON) counts toward neither winners nor losers.
    if (isWin(t.net_pnl)) winners += 1
    else if (isLoss(t.net_pnl)) losers += 1
  }
  return { net_pnl, gross_pnl, total_fees, winners, losers }
}

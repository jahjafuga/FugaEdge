import type { TradeListRow } from './trades-types'

export interface DayMetrics {
  date: string                    // ISO YYYY-MM-DD
  dayOfWeek: string               // "Wednesday", etc. — derived from `date`
  grossPnl: number
  totalFees: number
  netPnl: number
  tradeCount: number
  winCount: number
  lossCount: number
  scratchCount: number
  // 0..1 ratio (winners / decided, scratches excluded) — matches existing
  // app convention used in electron/analytics/get.ts. UI multiplies by 100
  // for display. Null when no trades are decided (all scratches or empty day).
  winRate: number | null
  biggestWin: { symbol: string; pnl: number } | null
  worstLoss: { symbol: string; pnl: number } | null
  firstTradePnl: { symbol: string; pnl: number; rMultiple: number | null } | null
  avgRMultiple: number | null     // null when no trades have planned risk
  avgWin: number | null           // null when winCount = 0
  avgLoss: number | null          // null when lossCount = 0
  sessionFirstTradeTime: string | null   // HH:MM, null when tradeCount = 0
  sessionLastTradeTime: string | null    // HH:MM, null when tradeCount = 0
  /** Every symbol traded that day with its trade count and net P&L, sorted
   *  by net P&L descending (best first; ties broken by trade count desc then
   *  first-seen). Distinct-symbol count is symbolBreakdown.length. Powers the
   *  Overview "what did I trade today" breakdown and best/worst-symbol summary. */
  symbolBreakdown: { symbol: string; tradeCount: number; netPnl: number }[]
  totalShares: number
  totalDollarVolume: number
  mostUsedPlaybook: { playbook: string; tradeCount: number; winRate: number | null } | null
  // Day-scoped derivation of Deep Analytics → Execution's "money left on table"
  // (sum of per-trade ExitDelta.delta). Null when no trades on the day have MFE data.
  moneyLeftOnTable: number | null
  moneyLeftCoverage: { withMfe: number; total: number } | null

  // ── v0.2.2 Day 2 — Performance tab metrics ────────────────────────────
  // Tradervue Detailed-style statistics, scoped to one day. Classification
  // (A/B/C/D) and rationale: see "v0.2.2 spec update" in the plan addendum.

  avgTradePnl: number | null              // netPnl / tradeCount
  avgPerShareGainLoss: number | null      // netPnl / totalShares
  /** Σ positive net_pnl ÷ |Σ negative net_pnl|. `Infinity` is a real
   *  outcome (winners but no losers — a winning-only day), not an error.
   *  `null` when no decided trades (all scratches or empty day). Renders
   *  via {@link formatProfitFactor}. */
  profitFactor: number | null
  /** Avg win ÷ |avg loss| — a DIFFERENT metric from profitFactor (Σ wins ÷
   *  |Σ losses|). `Infinity` = winners but no losers; `0` = only losers;
   *  `null` = no decided trades. Renders via {@link formatPnlRatio}. */
  pnlRatio: number | null
  /** Chronological scan of net_pnl signs; scratches break both streaks
   *  (matches Tradervue's max-consecutive convention). 0 on empty day. */
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  /** Mean (close_time − open_time) in seconds. Skips trades with null
   *  close_time. Per-category variants narrow to net_pnl sign. */
  avgHoldSeconds: number | null
  avgHoldSecondsWinners: number | null
  avgHoldSecondsLosers: number | null
  avgHoldSecondsScratches: number | null
  /** Sample std dev (n−1 denominator) of net_pnl. `null` when
   *  `tradeCount < 3` — at smaller N the value is noise (see Class C
   *  rationale in the plan addendum). */
  stdDevPnl: number | null
  /** Day 2 contract: ships as `null` for all fixtures. Day 5 wires the
   *  intraday-bar excursion data through and these light up. Same
   *  awaiting-intraday pattern as {@link moneyLeftOnTable}. */
  avgMfeDollars: number | null
  avgMaeDollars: number | null
  /** Day 4 — per-trade mistake tags aggregated across the day's trades,
   *  sorted by count desc (ties broken alphabetically). Powers the Mistakes
   *  tab's "what went wrong today" rollup. Distinct from day-level mistake
   *  tags (DayDetail.dayMistakes), which tag the day itself. */
  mistakeTagCounts: { tag: string; count: number }[]
}

export interface DayDetail {
  date: string
  metrics: DayMetrics
  trades: TradeListRow[]
  // Day-level notes and mistakes ship in Day 4; placeholders here so the
  // shape is stable across the v0.2.2 build sequence.
  note: string | null
  dayMistakes: string[]
}

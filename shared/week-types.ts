import type { TradeListRow } from './trades-types'

// v0.2.2 Day 4.5b — week-scoped metrics for the tabbed Weekly Review modal.
// Reuses the day.ts conventions (net/counts/winRate/profitFactor/symbolBreakdown/
// mistakeTagCounts, plus avgWin/avgLoss) over the week's trades, and adds
// week-shaped fields (day-by-day, best/worst DAY, per-playbook, consistency,
// streak). Pure computation lives in src/core/analytics/week.ts.
export interface WeekMetrics {
  netPnl: number
  grossPnl: number
  totalFees: number
  tradeCount: number
  winCount: number
  lossCount: number
  scratchCount: number
  // 0..1 ratio (winners / decided, scratches excluded); null when no decided trades.
  winRate: number | null
  // Σ positive net / |Σ negative net|. Infinity = winners but no losers; null = no decided.
  profitFactor: number | null
  // Avg win ÷ |avg loss| — DIFFERENT from profitFactor. Infinity = no losers;
  // 0 = no winners; null = no decided. Renders via formatPnlRatio. Mirrors day.ts.
  pnlRatio: number | null
  avgWin: number | null
  avgLoss: number | null
  // Single biggest winning / worst losing TRADE of the week (sign-gated, mirrors
  // day biggestWin/worstLoss). Distinct from bestDay/worstDay, which aggregate
  // by day. Null when the week has no winners / no losers respectively.
  biggestWin: { symbol: string; pnl: number } | null
  worstLoss: { symbol: string; pnl: number } | null
  // Avg of per-trade r_multiple over trades that have one set; null when none do.
  avgRMultiple: number | null
  // Σ per-trade notional (shares_bought·avg_buy + shares_sold·avg_sell).
  totalDollarVolume: number
  // netPnl ÷ total shares traded (bought + sold); null when no shares.
  avgPerShareGainLoss: number | null
  // Mean MFE / MAE in $/share over the week's trades that have intraday data;
  // null when none do (keeps the "Awaiting intraday" placeholder). Mirrors day.ts.
  avgMfeDollars: number | null
  avgMaeDollars: number | null
  // Week-scoped sum of per-trade ExitDelta.delta (best-exit gap from each trade's
  // own exit fills — fill-based, not intraday). Null when no trade scaled out with
  // a better available exit. Mirrors day.ts moneyLeftOnTable/moneyLeftCoverage.
  moneyLeftOnTable: number | null
  moneyLeftCoverage: { withMfe: number; total: number } | null
  // All symbols traded that week, sorted by net P&L desc (ties: count desc, then first-seen).
  symbolBreakdown: { symbol: string; tradeCount: number; netPnl: number }[]
  // Per-trade mistake tags aggregated across the week, sorted count desc then alpha.
  mistakeTagCounts: { tag: string; count: number }[]

  // ── week-new ──────────────────────────────────────────────────────────
  /** Traded days only, chronological asc. */
  dayByDay: { date: string; netPnl: number; tradeCount: number }[]
  /** Highest-net day, only when its net > 0 (sign-gated, mirrors day biggestWin). */
  bestDay: { date: string; netPnl: number } | null
  /** Lowest-net day, only when its net < 0 (sign-gated, mirrors day worstLoss). */
  worstDay: { date: string; netPnl: number } | null
  /** Tagged trades only, sorted net P&L desc. */
  perPlaybook: { playbook: string; tradeCount: number; netPnl: number; winRate: number | null }[]
  greenDays: number
  tradingDays: number
  /** Sample std dev (n−1) of per-day net P&L; null when tradingDays < 3. */
  dayPnlStdDev: number | null
  /** Streak into the week's end, walking back through daily P&L. */
  streak: { kind: 'win' | 'loss' | 'none'; days: number }
}

export interface WeekDetail {
  weekStart: string  // Sunday, YYYY-MM-DD
  weekEnd: string    // Saturday, YYYY-MM-DD
  metrics: WeekMetrics
  trades: TradeListRow[]  // all week trades, for the equity curve + Trades tab
  notes: string           // week_notes reflection
}

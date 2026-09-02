import type { MistakesTable } from './mistakes-types'
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
  // Mean per-trade position size (max of the two legs); null when no position.
  // The "Avg share size" stat (djsevans87) — see core/performance/avgShareSize.
  avgShareSize: number | null
  // netPnl ÷ total shares traded (bought + sold); null when no shares.
  avgPerShareGainLoss: number | null
  // Mean MFE / MAE in $/share over the week's trades that have intraday data;
  // null when none do (keeps the "Awaiting intraday" placeholder). Mirrors day.ts.
  avgMfeDollars: number | null
  avgMaeDollars: number | null
  // Avg hold time in SECONDS, over the week's trades that have a close_time
  // (still-open trades are skipped). Bucketed by net_pnl sign. Each is null
  // when its bucket is empty. v0.2.2 Day 5b — mirrors day.ts hold-time logic.
  avgHoldSeconds: number | null
  avgHoldSecondsWinners: number | null
  avgHoldSecondsLosers: number | null
  avgHoldSecondsScratches: number | null
  // Week-scoped sum of per-trade ExitDelta.delta (best-exit gap from each trade's
  // own exit fills — fill-based, not intraday). Null when no trade scaled out with
  // a better available exit. Mirrors day.ts moneyLeftOnTable/moneyLeftCoverage.
  moneyLeftOnTable: number | null
  moneyLeftCoverage: { withMfe: number; total: number } | null
  // All symbols traded that week, sorted by net P&L desc (ties: count desc, then first-seen).
  symbolBreakdown: { symbol: string; tradeCount: number; netPnl: number }[]
  // Per-trade mistake tags aggregated across the week, sorted count desc then alpha.
  mistakeTagCounts: { tag: string; count: number }[]
  /** djsevans87 30 Jul -- the mistakes TABLE, beside the chip rollup above.
   *  Per-tag rows with net, average and win rate, plus two toplines counted
   *  ONCE PER TRADE (a two-tag trade is one trade). Computed in
   *  src/core/analytics/mistakes.ts, the same function the day metrics call,
   *  so the two periods can never drift. mistakeTagCounts is left exactly as
   *  it was -- whatWorkedLeaked.ts reads it for three unrelated surfaces. */
  mistakesTable: MistakesTable

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

/** One day's journal entry text within a week. Snake_case mirrors the journal
 *  columns / shared JournalEntry. v0.2.x Phase 5 — feeds the weekly pattern
 *  view's topic aggregation; carried as raw text, not yet rendered. */
export interface WeekJournalEntry {
  date: string
  premarket_notes: string
  postsession_notes: string
}

/** ONE WINDOW OF THE BOOK, with nothing week-shaped about it.
 *
 *  Everything getWeekDetail ever did EXCEPT two things: it does not derive a
 *  Saturday from a Sunday, and it does not read week_notes. Those two are the
 *  only week-shaped lines the repo had; the other four -- the trades read, the
 *  journal range, and the two echoed labels -- work on any pair of dates.
 *
 *  A NOTE IS NOT A PROPERTY OF A WINDOW. week_notes is keyed on a week id, so
 *  it belongs to the caller that has one. That is why there is no notes field
 *  here rather than an empty string. */
export interface PeriodDetail {
  from: string  // YYYY-MM-DD, inclusive
  to: string    // YYYY-MM-DD, inclusive
  metrics: WeekMetrics
  trades: TradeListRow[]
  /** Per-day journal entry text inside the window. Only days WITH a journal
   *  row appear. */
  entries: WeekJournalEntry[]
}

/** THE WEEK, which is one window plus its note.
 *
 *  NOT derived from PeriodDetail, and the first version of this comment
 *  said it was. Every field is written out, because four fixture files and
 *  the IPC handler depend on this exact shape and an extends or a spread
 *  would let a field arrive here without anyone declaring it. Byte for
 *  byte what it has always been; the repo composes it from a PeriodDetail
 *  by hand. */
/** ONE ROW OF THE MONTH'S WEEKS LADDER.
 *
 *  It carries TWO windows and they are not the same window:
 *    from/to           the CLIPPED part inside the month -- what the row SHOWS
 *                      and what its numbers were summed over
 *    weekStart/weekEnd the WHOLE week -- what the row OPENS
 *
 *  June 2026's first row shows Jun 1..6 and opens May 31..Jun 6. Summing the
 *  full week would overshoot the month; opening the clip would hand the trader
 *  a fragment of a week and call it a weekly review. */
export interface MonthWeekSummary {
  weekStart: string
  weekEnd: string
  from: string
  to: string
  /** Calendar days in the clipped window, 1..7. */
  days: number
  straddles: boolean
  tradeCount: number
  netPnl: number
  tradingDays: number
  /** 0..1, scratch-excluded; null when no decided trade -- WeekMetrics' own
   *  convention, so an untraded week reads as an absence and never as 0%. */
  winRate: number | null
}

/** THE MONTH DRAWER'S PAYLOAD: a window plus the month's own note.
 *
 *  Composed BY HAND from a PeriodDetail, for the same reason WeekDetail is
 *  (see the note below it): an extends or a spread would let a field arrive
 *  here without anyone declaring it. */
export interface MonthDetail {
  from: string  // YYYY-MM-DD, the month's first calendar day
  to: string    // YYYY-MM-DD, its last
  metrics: WeekMetrics
  trades: TradeListRow[]
  entries: WeekJournalEntry[]
  notes: string  // month_notes reflection, '' when unwritten
  /** The weeks inside the month, in calendar order, each clipped to it.
   *  Their tradeCount, netPnl and tradingDays sum to the month exactly --
   *  asserted in electron/month/__tests__/monthLadder.test.ts against
   *  getPeriodDetail, never against a literal. */
  ladder: MonthWeekSummary[]
}

export interface WeekDetail {
  weekStart: string  // Sunday, YYYY-MM-DD
  weekEnd: string    // Saturday, YYYY-MM-DD
  metrics: WeekMetrics
  trades: TradeListRow[]  // all week trades, for the equity curve + Trades tab
  notes: string           // week_notes reflection
  /** The week's per-day journal entry text (Sun–Sat). Only days WITH a journal
   *  row appear; a week with none → []. Phase 5's Patterns tab re-runs the topic
   *  matcher over these — they are not rendered by any tab yet. */
  entries: WeekJournalEntry[]
}

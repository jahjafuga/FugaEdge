import type { MistakeAxis } from './mistakes-types'

export interface EquityPoint {
  date: string                   // YYYY-MM-DD
  daily_pnl: number              // sum of net_pnl on this date
  cumulative_net_pnl: number     // running total through this date inclusive
}

export interface MaxDrawdown {
  amount: number              // peak - trough in $
  percent: number | null      // amount / peak; null when peak <= 0
  peak_date: string           // date the peak was reached
  peak_value: number
  trough_date: string         // first date the lowest point was reached
  trough_value: number
  recovered: boolean
  recovery_date: string | null  // first date cumulative crossed back above the peak
}

export type StreakKind = 'win' | 'loss'

export interface Streak {
  kind: StreakKind
  length: number
  start_date: string
  end_date: string
  total_pnl: number
}

export interface CurrentStreak {
  kind: StreakKind
  length: number
  start_date: string
  total_pnl: number
}

export interface FeeImpact {
  total_fees: number
  total_gross_pnl: number
  total_net_pnl: number
  fees_as_pct_of_gross: number | null   // null if gross <= 0
  avg_fee_per_trade: number | null      // null if trade_count == 0
}

export interface SymbolStat {
  symbol: string
  trade_count: number
  net_pnl: number
  total_fees: number
  winners: number
  losers: number
}

export interface ExitDelta {
  trade_id: number
  date: string
  symbol: string
  side: 'long' | 'short'
  exit_count: number              // number of exit fills
  actual_avg_exit: number         // avg price of exit fills
  best_exit_price: number         // best executed exit price
  actual_net_pnl: number
  best_exit_net_pnl: number       // hypothetical: all exits at best_exit_price (fees unchanged)
  delta: number                   // best_exit_net_pnl - actual_net_pnl (>= 0)
  // delta / best_exit_net_pnl — the fraction of the ACHIEVABLE money left on
  // the table (0..1+; >1 means you left more than the best-exit profit, e.g. a
  // red trade whose best exit was green). NULL when best_exit_net_pnl <= 0 (a
  // loser whose best exit still loses passes the delta filter; a finite
  // negative fraction would render confidently) — the formatter shows "—".
  pct_left_on_table: number | null
}

export interface MomentumBucket {
  key: string
  trade_count: number
  net_pnl: number
  win_rate: number | null
  avg_winner: number | null
  avg_loser: number | null
}

export interface VolumeByTimeBucket {
  window: string             // 'HH:MM' (start of 30-min window)
  trade_count: number
  shares: number             // sum of (shares_bought + shares_sold) for trades opened in window
  net_pnl: number
}

export interface ExtendedEntryCompare {
  clean_count: number        // signed 9 EMA distance < +5% (at / near / below)
  clean_net_pnl: number
  clean_win_rate: number | null
  extended_count: number     // signed 9 EMA distance >= +5% (above the EMA only)
  extended_net_pnl: number
  extended_win_rate: number | null
  trades_with_data: number   // total trades whose distance is known
  trades_missing_data: number
}

export interface MistakeImpact {
  label: string
  /** Beat 2c-display-β.1 — the axis this mistake belongs to, for the per-axis
   *  PER MISTAKE table split (β.2 groups byMistake into Technical / Psychological). */
  axis: MistakeAxis
  trade_count: number
  net_pnl: number
  avg_pnl: number | null
  win_rate: number | null
}

export interface MistakesAnalytics {
  byMistake: MistakeImpact[]       // ordered by net_pnl ascending (worst first)
  trades_with_any_mistake: number
  trades_without_mistakes: number
  flawed_net_pnl: number
  clean_net_pnl: number
  flawed_win_rate: number | null
  clean_win_rate: number | null
}

// Phase 3 (djsevans87) — per-DAY rule-break rollup, the day-level sibling of the
// per-trade MistakesAnalytics. No axis (rule-breaks are a flat list). Aggregated
// over DAYS: a day with N breaks contributes to N labels' day_count but is ONE
// day in the clean-vs-flawed split.
export interface RuleBreakImpact {
  label: string
  day_count: number                // distinct days this rule-break was tagged on
  net_pnl: number                  // Σ net P&L of those days
  avg_pnl_per_day: number | null   // net_pnl / day_count; null when day_count 0
  green_day_rate: number | null    // days net>0 / day_count; null when day_count 0
}

export interface RuleBreaksAnalytics {
  byRuleBreak: RuleBreakImpact[]   // ordered by net_pnl ascending (worst first)
  days_with_any_break: number      // flawed days (>= 1 break)
  clean_days: number               // traded days with no break tagged
  flawed_day_net_pnl: number
  clean_day_net_pnl: number
  flawed_green_rate: number | null // green flawed days / flawed days
  clean_green_rate: number | null  // green clean days / clean days
}

/** "Gave back profits" (djsevans87) — goal-TRIGGERED giveback rollup. Over days
 *  where the day's ordered cumulative net P&L crossed the configured daily goal
 *  AND then gave some back (peak-after-cross > final). Computed from CLOSED trades
 *  in close_time order — NOT intraday ticks. POINT-IN-TIME since schema 48
 *  (Dave #9): each day evaluates against the goal in force THAT day, resolved
 *  from the append-only profit_target_history (epoch seed = the value at
 *  upgrade time; changes are recorded from then on). */
export interface GivebackStats {
  /** Count of days that crossed the goal then gave some back (giveback > 0). */
  days: number
  /** Σ (peak-after-cross − final) over those days, in dollars (always >= 0). */
  total_giveback: number
  /** Mean (giveback / peak) over those days; null when days === 0. */
  avg_pct_off_top: number | null
  /** False only when NO goal was ever set (no history value > 0) — drives the
   *  card's "set a goal" empty state. A goal set in the past and later zeroed
   *  keeps its counted days (never a retroactive erasure). */
  goal_set: boolean
}

export interface RBucket {
  key: string         // '≤ -3R', '-3 to -2R', etc.
  range: [number, number]   // inclusive lower, exclusive upper (Infinity allowed)
  count: number
  net_pnl: number     // sum of net_pnl of trades in this bucket
}

export interface RAnalytics {
  /** Trades with a planned_risk set (so R is computed). */
  coverage: number
  total_trades: number
  avg_r: number | null
  median_r: number | null
  best_r: number | null
  worst_r: number | null
  /** Mean R — surfaced as "expectancy per trade" in the UI. */
  expectancy: number | null
  buckets: RBucket[]
}

export interface MomentumAnalytics {
  volumeByHalfHour: VolumeByTimeBucket[]
  byTimeframe: MomentumBucket[]            // 10s / 1m / 5m / unset
  byEma9Bucket: MomentumBucket[]           // canonical signed 7-band labels (below → blow-off)
  byConfidence: MomentumBucket[]           // 1 / 2 / 3 / 4 / 5 / unset
  extendedEntry: ExtendedEntryCompare
  /** Total trades that have a populated entry_ema9_distance_pct. */
  ema9_coverage: number
  /** Trades that have a confidence rating set. */
  confidence_coverage: number
}

// By-float-size breakdown — buckets trades by float at time of trade.
// 'Unset' captures trades with no float_shares value (either not yet
// enriched from market_data or never available from Polygon).
export type FloatBucketKey = 'nano' | 'micro' | 'small' | 'mid' | 'unset'

export interface FloatBucket {
  key: FloatBucketKey
  label: string            // human-readable: 'Nano (<1M)', 'Micro (1M-5M)', ...
  trade_count: number
  net_pnl: number
  winners: number
  losers: number
  win_rate: number | null  // null when trade_count = 0
}

export interface FloatAnalytics {
  buckets: FloatBucket[]
  /** Trades with float_shares set — useful for the "X of Y trades have float data" callout. */
  coverage: number
  total_trades: number
}

// By-sentiment breakdown — buckets trades by the per-day market sentiment
// stored in session_meta. Always emits all 5 levels + 'unset' so the
// Analytics table has stable rows even when most days lack a rating.

export interface SentimentBucket {
  level: 1 | 2 | 3 | 4 | 5 | null  // null = unset
  label: string                     // "1 (3+ stocks >100%)" etc.
  trade_count: number
  net_pnl: number
  winners: number
  losers: number
  win_rate: number | null           // null when trade_count = 0
  avg_winner: number | null
  avg_loser: number | null
}

export interface SentimentAnalytics {
  buckets: SentimentBucket[]
  /** Distinct trading days that have a sentiment rating set. */
  rated_days: number
  /** Distinct trading days in the trade set. */
  total_days: number
}

// By-catalyst-type breakdown — groups trades by trades.catalyst_type.
// Unset / empty catalysts collapse into a single 'Unset' bucket. The
// catalyst options are user-extensible (any string in the column), so the
// bucket list is dynamic — present whatever values appear in the data.
export interface CatalystBucket {
  /** Catalyst tag value, or null when the trade has no catalyst set. */
  catalyst_type: string | null
  trade_count: number
  net_pnl: number
  winners: number
  losers: number
  win_rate: number | null
  avg_winner: number | null
  avg_loser: number | null
}

export interface CatalystAnalytics {
  buckets: CatalystBucket[]
  /** Trades with a catalyst_type set — the rest fall into the 'Unset' row. */
  tagged_trades: number
  total_trades: number
}

export interface DisciplineStats {
  days_traded: number          // distinct calendar dates with at least one trade
  days_journaled: number       // distinct calendar dates with non-empty journal content
  discipline_streak: number    // consecutive market days (Mon–Fri) of trades or journal entries
  /** 0–100. days_journaled / max(days_traded, 1) × 100, clipped to 100. */
  discipline_score: number
}

export interface AnalyticsData {
  trade_count: number
  equity: EquityPoint[]
  maxDrawdown: MaxDrawdown | null
  longestWinStreak: Streak | null
  longestLossStreak: Streak | null
  currentStreak: CurrentStreak | null
  feeImpact: FeeImpact
  bestSymbols: SymbolStat[]   // top 5 by net_pnl desc
  worstSymbols: SymbolStat[]  // bottom 5 by net_pnl asc
  exitQuality: ExitDelta[]    // top N by delta desc
  momentum: MomentumAnalytics
  mistakes: MistakesAnalytics
  /** Phase 3 (djsevans87) — per-day rule-break rollup (the day-level sibling of
   *  `mistakes`). */
  ruleBreaks: RuleBreaksAnalytics
  /** "Gave back profits" (djsevans87) — goal-triggered giveback rollup, sibling
   *  of `ruleBreaks`. */
  giveback: GivebackStats
  r: RAnalytics
  float: FloatAnalytics
  sentiment: SentimentAnalytics
  catalyst: CatalystAnalytics
  discipline: DisciplineStats
}

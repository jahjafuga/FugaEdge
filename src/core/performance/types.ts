// Pure types for the Performance / Reports Overview engine. No electron,
// fs, or sqlite imports — these compile cleanly inside a Next.js page or
// any other web target per /ARCHITECTURE.md.

export type SideFilter = 'all' | 'long' | 'short'

export type DurationBucket = 'all' | 'under-1m' | '1-5m' | '5-30m' | 'over-30m'

export type QuickRange = '30d' | '60d' | '90d' | 'ytd' | 'all'

export interface DateRange {
  /** YYYY-MM-DD inclusive. */
  from: string
  /** YYYY-MM-DD inclusive. */
  to: string
}

/** Filter state from the Overview top bar. All fields are AND-combined.
 *  Empty arrays / 'all' mean "no constraint on this field". */
export interface OverviewFilters {
  /** Matched against trade.symbol (case-insensitive contains). Empty = any. */
  symbol: string
  /** Multi-select against trade.playbook_name. Empty = any. */
  playbooks: string[]
  /** Multi-select against trade.catalyst_type. Empty = any. */
  catalysts: string[]
  /** Multi-select — trades that carry AT LEAST ONE of these mistake labels. */
  mistakes: string[]
  side: SideFilter
  duration: DurationBucket
  /** Inclusive date window. Null = no date constraint. */
  range: DateRange | null
}

// ── Series points ─────────────────────────────────────────────────────────

export interface DailyPnLPoint {
  /** YYYY-MM-DD */
  date: string
  pnl: number
  tradeCount: number
}

export interface CumulativePoint {
  date: string
  cumulative: number
}

export interface DailyVolumePoint {
  date: string
  /** Sum of shares_bought + shares_sold for trades opened that day. */
  volume: number
}

export interface DailyWinRatePoint {
  date: string
  /** 0..1, or null when no decided trades that day. */
  winRate: number | null
  tradeCount: number
}

// ── Period aggregate ──────────────────────────────────────────────────────

export interface DayPnL {
  date: string
  pnl: number
}

/** Aggregate stats for a single period. Powers the headline comparison
 *  table + the auto-insight generator. */
export interface PeriodMetrics {
  range: DateRange
  // P&L
  netPnL: number
  grossPnL: number
  fees: number
  /** netPnL / trades. Null when no trades. */
  avgTradePnL: number | null
  /** netPnL / tradingDays. Null when no trading days. */
  avgDailyPnL: number | null
  /** gross wins / |gross losses|. Null when no losers / no winners. */
  profitFactor: number | null
  // Counts
  trades: number
  winners: number
  losers: number
  /** Trades classified as scratch (|net_pnl| <= SCRATCH_EPSILON; see shared/trade-classification.ts). */
  scratches: number
  tradingDays: number
  // Hold time (seconds; null when no qualifying trades or open_time/close_time missing)
  avgHoldSeconds: number | null
  avgHoldSecondsWinners: number | null
  avgHoldSecondsLosers: number | null
  // Streaks (consecutive trades, ordered chronologically by open_time)
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  // Quality
  /** 0..1, or null when no decided trades. */
  winRate: number | null
  avgWinner: number | null
  avgLoser: number | null
  largestWinner: number | null
  largestLoser: number | null
  /** Avg winner / |avg loser|. Null when either is null. */
  winLossRatio: number | null
  // Day extremes
  bestDay: DayPnL | null
  worstDay: DayPnL | null
  // Day consistency (Ross's #1 review metric): a DAY is green/red/breakeven by
  // its AGGREGATE net P&L (sum of the day's trades), NOT the per-trade scratch
  // epsilon — a day either made money (>0), lost money (<0), or netted flat (0).
  greenDays: number
  redDays: number
  breakevenDays: number
  avgGreenDay: number | null
  avgRedDay: number | null
  largestGreenDay: number | null
  largestRedDay: number | null
  /** greenDays / tradingDays; null when no trading days. */
  greenDayPct: number | null
  // Expectancy in R — mean r_multiple over the COVERED subset (trades with a
  // logged stop/risk). Null when no trade carries an r_multiple; rCoverage
  // reports how many do, so the UI can label "(of N trades with R)".
  expectancyR: number | null
  rCoverage: number
  // ── Group 2: exit-quality + behavioural ──────────────────────────────────
  // MFE-capture % — per-trade mean of net_pnl / (mfe$/share * positionShares),
  // i.e. what fraction of the peak FAVORABLE dollars the trade actually kept.
  // mfe is $/share, so we multiply by positionShares = max(shares_bought,
  // shares_sold) to reach favorable dollars (this deliberately diverges from
  // computeFullStats' avg_mfe_dollars, which is per-share — mirroring it would
  // be dimensionally wrong). Covered = mfe non-null, mfe > 0, positionShares >
  // 0. Null when no covered trade; mfeCaptureCoverage reports the count.
  mfeCapturePct: number | null
  mfeCaptureCoverage: number
  // MAE-to-stop — per-trade mean of mae / risk_per_share (both $/share): how
  // far the trade ran against you relative to the planned stop. > 1 means it
  // breached the stop distance intratrade. Covered = mae non-null AND a logged
  // stop (risk_per_share non-null, > 0). Null when no covered trade.
  maeToStop: number | null
  maeToStopCoverage: number
  // R-multiple distribution — fixed 7-bucket histogram over the covered
  // (non-null r_multiple) trades, buckets always present (count 0 when empty)
  // in display order. rDistCoverage == rCoverage (the same covered subset).
  rDistribution: RBucket[]
  rDistCoverage: number
  // After a big win / big loss — mean P&L of the trade immediately FOLLOWING a
  // "big" trade (>= 2x the period's own avgWinner, or <= 2x its avgLoser), in
  // chronological order. A revenge / overconfidence check. Null when there are
  // no qualifying big trades with a follower (a big trade that is last in the
  // period is excluded and uncounted). The *Count fields report how many big
  // wins / losses had a following trade.
  afterBigWinAvgPnl: number | null
  afterBigWinCount: number
  afterBigLossAvgPnl: number | null
  afterBigLossCount: number
  // ── Wired tier (Beat 2) — already computed by computeFullStats /
  // computeDrawdown, attached per period in computePeriodComparison (NOT in
  // computePeriodMetrics, whose CalendarCompareStrip caller must stay cheap).
  // Optional so bare computePeriodMetrics callers leave them undefined; the
  // verdict block em-dashes null/undefined alike.
  /** Avg daily share volume (shares bought + sold per trading day). */
  avgDailyVolume?: number | null
  /** Avg hold of scratch trades, in seconds. */
  avgHoldScratch?: number | null
  /** Max peak-to-trough drawdown of the cumulative-P&L curve, $ magnitude. */
  maxDrawdown?: number | null
  // ── Phase 1 per-share + shares tier (djsevans87) — FullStats-derived, attached
  // per period in computePeriodComparison (same wired pattern as avgDailyVolume).
  // Optional so bare computePeriodMetrics callers leave them undefined.
  /** Pooled per-share P&L: net / Σ position shares (max legs). */
  avgPerSharePnl?: number | null
  /** Per-trade mean per-share P&L over winners. */
  avgPerShareGain?: number | null
  /** Per-trade mean per-share P&L over losers (negative). */
  avgPerShareLoss?: number | null
  /** Highest single-trade per-share P&L among winners. */
  maxPerShareWin?: number | null
  /** Lowest (most negative) single-trade per-share P&L among losers. */
  maxPerShareLoss?: number | null
  /** Total shares traded (both legs summed). */
  totalSharesTraded?: number | null
  // ── Phase 2 P&L % tier (djsevans87) — price-move % per trade (per-share $ /
  // entry price), stored as a RATIO (×100 at display via the 'pct' format kind).
  // FullStats-derived, attached in computePeriodComparison.
  /** Avg profit-per-trade as a price-move ratio (mean over winners + losers). */
  apptPct?: number | null
  /** Mean price-move ratio over winners. */
  avgWinPct?: number | null
  /** Mean price-move ratio over losers (negative). */
  avgLossPct?: number | null
  /** Highest winner price-move ratio. */
  maxWinPct?: number | null
  /** Lowest (most negative) loser price-move ratio. */
  maxLossPct?: number | null
  /** Avg position size in $ (mean of position_shares × entry_price over all trades). */
  avgPositionSize?: number | null
}

/** One bar of the R-multiple histogram. `bucket` is the display label; the
 *  ordered array of these (all buckets present, even at count 0) is the
 *  distribution. */
export interface RBucket {
  bucket: string
  count: number
}

// ── Delta / comparison ────────────────────────────────────────────────────

export type DeltaDirection = 'up' | 'down' | 'flat'

export interface DeltaMetric {
  metric: string
  valueA: number | null
  valueB: number | null
  /** valueA - valueB. Null when either side is null. */
  delta: number | null
  /** (valueA - valueB) / |valueB|. Null when valueB is 0 or either null. */
  pctChange: number | null
  direction: DeltaDirection
  /** Whether the up/down move is GOOD for the trader. e.g. win rate up =
   *  improvement, avg-loser-magnitude down = improvement. */
  isImprovement: boolean
}

/** A single row of an aligned series — one period A value + one period B
 *  value at the same day-index. Either side can be missing when the
 *  periods are different lengths. */
export interface AlignedRow {
  /** 1-based day index inside its period. */
  dayIndex: number
  /** Calendar date in period A at this index (YYYY-MM-DD). */
  dateA: string | null
  /** Calendar date in period B at this index (YYYY-MM-DD). */
  dateB: string | null
  /** Value from series A (pnl or cumulative). Null when A is shorter. */
  valueA: number | null
  /** Value from series B. Null when B is shorter. */
  valueB: number | null
}

export interface AlignedSeries {
  rows: AlignedRow[]
  /** Period A trading-day count. */
  lengthA: number
  /** Period B trading-day count. */
  lengthB: number
}

export type ComparisonInsightTone = 'positive' | 'negative' | 'neutral'

export interface ComparisonInsight {
  id: string
  tone: ComparisonInsightTone
  text: string
}

export interface ComparisonResult {
  periodA: PeriodMetrics
  periodB: PeriodMetrics
  headline: DeltaMetric[]
  dailyPnL: AlignedSeries
  cumulativePnL: AlignedSeries
  insights: ComparisonInsight[]
}

// ── Breakdown comparison (catalyst / playbook / sentiment / DoW / hour) ──

export interface BreakdownRow {
  key: string
  netPnLA: number
  tradesA: number
  netPnLB: number
  tradesB: number
}

export type BreakdownDimension =
  | 'catalyst'
  | 'playbook'
  | 'sentiment'
  | 'dow'
  | 'hour'
  | 'price'
  | 'float'
  | 'rvol'
  | 'gap'
  | 'region'
  | 'country'

export interface BreakdownComparison {
  dimension: BreakdownDimension
  rows: BreakdownRow[]
  /** In-scope (rangeA ∪ rangeB) trades whose dimension key was null — dropped
   *  from `rows` but COUNTED so a coverage-gated card can disclose the gap
   *  (e.g. "N without float data"). 0 for dimensions that never drop. */
  notShown: number
}

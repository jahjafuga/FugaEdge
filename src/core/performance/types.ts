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
  | 'region'
  | 'country'

export interface BreakdownComparison {
  dimension: BreakdownDimension
  rows: BreakdownRow[]
}

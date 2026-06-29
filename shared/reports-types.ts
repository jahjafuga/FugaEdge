export interface BucketStats {
  key: string
  /** Optional stable sort/display order — lower comes first. */
  order: number
  trade_count: number
  net_pnl: number
  total_fees: number
  winners: number
  losers: number
  win_rate: number | null
  avg_winner: number | null
  avg_loser: number | null
  largest_winner: number | null
  largest_loser: number | null
  profit_factor: number | null
}

export interface FullStats {
  // P&L totals
  total_net_pnl: number
  total_gross_pnl: number
  total_fees: number
  total_commissions: number | null // null — DAS Trades.csv has no commission column

  // P&L averages
  avg_trade_pnl: number | null
  avg_daily_pnl: number | null     // sum(net_pnl) / distinct trade days
  avg_winner: number | null        // mean of winning trades
  avg_loser: number | null         // mean of losing trades (negative)
  avg_per_share_pnl: number | null // pooled: total_net / Σ position shares (max legs)
  // Phase 1 per-share tier (djsevans87) — per-TRADE means/extremes over the
  // winner/loser subsets (mirroring avg_winner/avg_loser), NOT pooled. per-share
  // basis = net_pnl / max(shares_bought, shares_sold). Null when the side is empty.
  avg_per_share_gain: number | null  // mean per-share P&L over winners
  avg_per_share_loss: number | null  // mean per-share P&L over losers (negative)
  max_per_share_win: number | null   // highest single-trade per-share P&L (winners)
  max_per_share_loss: number | null  // lowest (most negative) per-share P&L (losers)
  // Phase 2 (djsevans87) — price-move % per trade = per-share $ / entry price,
  // stored as a RATIO/fraction (×100 at display, like greenDayPct / scratch_pct —
  // NOT the already-×100 avg_mae_pct / avg_mfe_pct below). Per-trade means over the
  // winner/loser subsets; appt_pct is the mean over winners + losers (scratch out).
  appt_pct: number | null      // avg profit-per-trade as a price-move ratio
  avg_win_pct: number | null   // mean price-move ratio over winners
  avg_loss_pct: number | null  // mean price-move ratio over losers (negative)
  max_win_pct: number | null   // highest winner price-move ratio
  max_loss_pct: number | null  // lowest (most negative) loser price-move ratio
  // Phase 3 (djsevans87) — mean of position_shares × entry_price ($) over all
  // trades; entry<=0 / zero-position excluded. Pure trade data.
  avg_position_size: number | null
  std_dev_pnl: number | null       // sample std dev across trades (null when N < 2)
  profit_factor: number | null

  // Volume
  total_shares_traded: number      // sum of (shares_bought + shares_sold)
  avg_daily_volume: number | null  // total_shares / trading_days

  // Counts
  trade_count: number
  winners: number
  losers: number
  scratches: number                // |net_pnl| <= $2
  scratch_pct: number | null       // scratches / trade_count
  trading_days: number

  // Hold time (seconds)
  avg_hold_seconds: number | null
  avg_hold_seconds_winners: number | null
  avg_hold_seconds_losers: number | null
  avg_hold_seconds_scratches: number | null

  // Streaks
  max_consecutive_wins: number
  max_consecutive_losses: number

  // System quality
  kelly_pct: number | null         // (W - L/R) × 100; null if undefined
  sqn: number | null               // (avg / sd) × sqrt(N); null if undefined
  k_ratio: number | null           // Kestner-style slope/SE/√N over daily equity
  random_chance_pct: number | null // 1 / (1 + SQN² × 0.1); 0..1

  // Excursion — averages computed from intraday_bars (entry-to-exit window).
  // Null when no trades have populated mae/mfe yet.
  //   *_dollars: $/share averaged across trades
  //   *_pct:     |MAE or MFE| / entry × 100, averaged across trades
  avg_mae: number | null          // $/share — legacy field, mirrors avg_mae_dollars
  avg_mfe: number | null
  avg_mae_dollars: number | null
  avg_mfe_dollars: number | null
  avg_mae_pct: number | null
  avg_mfe_pct: number | null
  /** Trades that have populated mae/mfe values — used to label coverage. */
  excursion_coverage: number
}

export interface DayBreakdown {
  date: string
  trade_count: number
  winners: number
  losers: number
  scratches: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
}

export interface DrawdownEquityPoint {
  date: string
  cumulative: number
  in_drawdown: boolean
}

export interface DrawdownInfo {
  amount: number
  percent: number | null
  peak_date: string
  peak_value: number
  trough_date: string
  trough_value: number
  recovered: boolean
  recovery_date: string | null
  longest_period_days: number
  current_drawdown: number
  equity: DrawdownEquityPoint[]
}

export type VolumeAnalysisStatus = 'unavailable' | 'ready'

export interface VolumeAnalysis {
  status: VolumeAnalysisStatus
  /** Surfaces in the UI when status === 'unavailable'. */
  reason?: string
  byFloat: BucketStats[]
  byRvol: BucketStats[]
  /** Total trades the analysis was computed over. */
  trades_analyzed: number
  /** Trades that were skipped because no float / RVOL data was available. */
  trades_missing_data: number
}

export interface ReportsData {
  byPriceRange: BucketStats[]
  byDayOfWeek: BucketStats[]
  byHour: BucketStats[]
  bySymbol: BucketStats[]
  byShareSize: BucketStats[]
  byRegion: BucketStats[]
  byCountry: BucketStats[]
  /** Trades the By-Country breakdown drops — no country logged, or in a country
   *  below the long-tail-collapse threshold. Disclosed on the card so the shown
   *  total isn't silently short. Computed at read time; not stored. */
  byCountryNotShown: number
  bySector: BucketStats[]
  byIndustry: BucketStats[]
  fullStats: FullStats
  volumeAnalysis: VolumeAnalysis
  winLossDays: DayBreakdown[]      // ordered by date ASC
  drawdown: DrawdownInfo | null
  trade_count: number
}

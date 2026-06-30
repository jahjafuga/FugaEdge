// v0.2.4 Session 4 — types shared between Electron data layer and React
// renderer (and the preload bridge between them). Lives in shared/ per
// ARCHITECTURE.md rule #7. The internal raw DB-row shape
// (TradeWithTechnicalsDbRow) stays in electron/technicals/repo.ts since
// only the data layer needs it.

// Per-timeframe indicator snapshot at the bar containing the first entry
// fill. Canonical declaration lives in
// src/core/technicals/computeTradeTechnicals.ts; inlined here because
// shared/ is the lowest layer and must not import from src/. Keep in sync
// with that type.
//
// Precedent: CountrySource in shared/trades-types.ts uses the same
// inline-with-sync-comment pattern for the same reason.
export interface TechnicalSnapshot {
  macd_line: number | null
  signal_line: number | null
  histogram: number | null
  histogram_prior: number | null
  macd_positive: boolean | null      // macd_line > 0
  macd_open: boolean | null          // macd_line > signal_line
  macd_rising: boolean | null        // histogram > histogram_prior
  vwap: number | null
  vwap_dist_pct: number | null       // (entry_price - vwap) / vwap * 100
  ema9: number | null
  ema9_dist_pct: number | null       // (entry_price - ema9) / ema9 * 100
  ema20: number | null
  ema20_dist_pct: number | null      // (entry_price - ema20) / ema20 * 100
  ema9_above_ema20: boolean | null   // (ema9 - ema20) > 0
}

/**
 * Parsed trade_technicals row as exposed to callers.
 * Includes trade_id (added by the repo) and structurally
 * compatible with the pure compute's TradeTechnicals
 * output via the tf_1m / tf_5m / data_complete / etc fields.
 */
export interface TradeTechnicalsRow {
  trade_id: number
  tf_1m: TechnicalSnapshot
  tf_5m: TechnicalSnapshot
  data_complete: boolean
  computed_at: string
  schema_version: number
}

/**
 * Parsed bulk-reader row: lean trade context joined to the nested
 * per-timeframe technicals snapshot. `technicals` is null when no
 * trade_technicals row exists yet (LEFT JOIN didn't match), so the
 * renderer can count these toward the "N excluded (no indicator
 * data)" chip per spec §C:103.
 */
export interface TradeWithTechnicalsRow {
  id: number
  symbol: string
  date: string
  side: 'long' | 'short'
  net_pnl: number
  open_time: string // ISO-8601 UTC entry timestamp
  /** Origin export shape; 'summary' trips (fake 09:30 anchor) are excluded from
   *  the Time-of-Day matrix via isSummaryTrip. Optional so partial-row fixtures
   *  needn't declare it; the production SELECT always populates it. */
  source_format?: string | null
  playbook_id: number | null
  playbook_name: string | null
  technicals: TradeTechnicalsRow | null
}

/**
 * Options for listTradesWithTechnicals.
 */
export interface ListTradesWithTechnicalsOptions {
  /** Inclusive Eastern-trading-day range (YYYY-MM-DD). Both must be
   *  set together; a partial range (only from OR only to) is
   *  silently ignored (no date filter applied). */
  from?: string
  to?: string
}

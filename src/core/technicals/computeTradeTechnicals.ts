// Pure per ARCHITECTURE rule 1: no electron / fs / db imports

import type { IntradayBar } from '@shared/market-types'
import { ema } from '@/core/charts/ema'
import { vwap } from '@/core/charts/vwap'
import { aggregate } from '@/core/charts/aggregate'
import { computeMacd } from '@/core/charts/macd'

/**
 * Schema version of this compute logic. Bump when the
 * indicator math changes (e.g. when v0.3.0's TradingView-
 * parity EMA seed unification lands). Stored on each
 * trade_technicals row; Session 3's backfill enumerates
 * rows with stale schema_version for recompute.
 */
export const TECHNICALS_SCHEMA_VERSION = 1

/**
 * Narrow input type — declares exactly what this module
 * needs and nothing more. Callers (Session 3 backfill,
 * Session 2 Commit 4 lazy-guard) pass adapters that
 * conform from the full RoundTrip / TradeListRow shapes.
 */
export interface TradeForTechnicals {
  side: 'long' | 'short'
  executions: { side: 'B' | 'S'; qty: number; price: number; time: string }[]
}

/**
 * Per-timeframe indicator snapshot at the bar containing
 * the first entry fill. All fields are nullable — when
 * the snapshot can't be computed (no bar contains the
 * fill, insufficient warmup for EMA seed, etc.), fields
 * remain null and the parent TradeTechnicals carries
 * data_complete = false.
 */
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
 * Per-trade indicator state output. trade_id is NOT
 * included here — the caller pairs this with trade_id
 * externally when upserting to the trade_technicals
 * table.
 */
export interface TradeTechnicals {
  tf_1m: TechnicalSnapshot
  tf_5m: TechnicalSnapshot
  data_complete: boolean
  computed_at: string  // ISO 8601 UTC
  schema_version: number
}

/**
 * Empty snapshot — all fields null. Used when the
 * first-fill bar can't be located on a given timeframe
 * (e.g. fill timestamp falls outside the bars array).
 */
function emptySnapshot(): TechnicalSnapshot {
  return {
    macd_line: null,
    signal_line: null,
    histogram: null,
    histogram_prior: null,
    macd_positive: null,
    macd_open: null,
    macd_rising: null,
    vwap: null,
    vwap_dist_pct: null,
    ema9: null,
    ema9_dist_pct: null,
    ema20: null,
    ema20_dist_pct: null,
    ema9_above_ema20: null,
  }
}

/**
 * Find the bar containing a UTC fill timestamp.
 * Returns the bar index, or -1 if no bar contains it.
 *
 * Contract: bar at index i contains fillTimeMs iff
 *   bars[i].t <= fillTimeMs < bars[i].t + bucketMs
 *
 * Bars are sorted ascending by t (callers guarantee this).
 * Linear scan from index 0; bars arrays in v0.2.4 are
 * bounded (~1000 active + ~1000 warmup), so O(n) is fine.
 * If performance becomes a concern, switch to binary
 * search — but only if/when measured.
 */
function findBarIndexContaining(
  bars: IntradayBar[],
  fillTimeMs: number,
  bucketMs: number,
): number {
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (b.t <= fillTimeMs && fillTimeMs < b.t + bucketMs) {
      return i
    }
  }
  return -1
}

/**
 * Compute one timeframe's TechnicalSnapshot.
 *
 * Inputs:
 *   - warmupBars: prior-day bars on the target timeframe
 *     (1M or 5M-aggregated). MACD and EMA prepend these
 *     to active for seed convergence; VWAP ignores them.
 *   - activeBars: active-day bars on the target timeframe.
 *     VWAP runs on these only.
 *   - entryPriceVwa: volume-weighted entry price (used in
 *     all three distance-pct numerators).
 *   - fillTimeMs: epoch ms of the first entry fill.
 *   - bucketMs: 60_000 for 1M, 300_000 for 5M (used to
 *     locate the bar containing fillTimeMs).
 *
 * Returns the snapshot, OR null if the first-fill bar
 * isn't locatable in activeBars (the caller treats this
 * as data_complete = false for that timeframe).
 */
function computeSnapshot(
  warmupBars: IntradayBar[],
  activeBars: IntradayBar[],
  entryPriceVwa: number,
  fillTimeMs: number,
  bucketMs: number,
): TechnicalSnapshot | null {
  // First-fill bar locator — operates on the ACTIVE bars.
  // If the fill timestamp falls outside the active-day
  // window (e.g. data fetch failure produced a truncated
  // active range), we can't compute a snapshot.
  const activeIdx = findBarIndexContaining(activeBars, fillTimeMs, bucketMs)
  if (activeIdx === -1) return null

  // MACD and EMA run over the warmup-union for seed
  // convergence. The corresponding active-bar index in
  // the union array is offset by the warmup length.
  const unionBars = [...warmupBars, ...activeBars]
  const unionIdx = warmupBars.length + activeIdx

  // MACD: re-run the pure compute over the union, then
  // look up values by source bar TIME, not by array
  // index. computeMacd returns DENSE arrays (null-prefix
  // bars are dropped from the output, so the array index
  // does NOT equal the source bar index). Each point
  // carries `time === bars[i].t`, so the lookup is exact.
  const macdResult = computeMacd(unionBars)
  const targetT = unionBars[unionIdx].t
  const priorT = unionIdx > 0 ? unionBars[unionIdx - 1].t : null

  const valueAtTime = (
    pts: { time: number; value: number }[],
    t: number | null,
  ): number | null =>
    t === null ? null : pts.find((p) => p.time === t)?.value ?? null

  const macd_line = valueAtTime(macdResult.macd, targetT)
  const signal_line = valueAtTime(macdResult.signal, targetT)
  const histogram = valueAtTime(macdResult.histogram, targetT)
  const histogram_prior = valueAtTime(macdResult.histogram, priorT)

  // EMA over the union — closes only. Direct application
  // of the ema() helper to the union close array.
  const unionCloses = unionBars.map((b) => b.c)
  const ema9Series = ema(unionCloses, 9)
  const ema20Series = ema(unionCloses, 20)
  const ema9_value = ema9Series[unionIdx] ?? null
  const ema20_value = ema20Series[unionIdx] ?? null

  // VWAP over the active day only — anchored at 09:30 ET
  // inside vwap.ts. Output is index-aligned with
  // activeBars, so activeIdx maps directly.
  const vwapSeries = vwap(activeBars)
  const vwap_value = vwapSeries[activeIdx]?.value ?? null

  // Derived booleans (each null when source is null).
  const macd_positive = macd_line !== null ? macd_line > 0 : null
  const macd_open =
    macd_line !== null && signal_line !== null
      ? macd_line > signal_line
      : null
  const macd_rising =
    histogram !== null && histogram_prior !== null
      ? histogram > histogram_prior
      : null
  const ema9_above_ema20 =
    ema9_value !== null && ema20_value !== null
      ? ema9_value - ema20_value > 0
      : null

  // Distance pcts.
  const vwap_dist_pct =
    vwap_value !== null && vwap_value !== 0
      ? ((entryPriceVwa - vwap_value) / vwap_value) * 100
      : null
  const ema9_dist_pct =
    ema9_value !== null && ema9_value !== 0
      ? ((entryPriceVwa - ema9_value) / ema9_value) * 100
      : null
  const ema20_dist_pct =
    ema20_value !== null && ema20_value !== 0
      ? ((entryPriceVwa - ema20_value) / ema20_value) * 100
      : null

  return {
    macd_line,
    signal_line,
    histogram,
    histogram_prior,
    macd_positive,
    macd_open,
    macd_rising,
    vwap: vwap_value,
    vwap_dist_pct,
    ema9: ema9_value,
    ema9_dist_pct,
    ema20: ema20_value,
    ema20_dist_pct,
    ema9_above_ema20,
  }
}

/**
 * Compute per-trade indicator state at the moment of entry.
 *
 * Per spec §A6 dual-evaluation-point rule:
 *   - entry_price = volume-weighted average of all entry-
 *     side fills (used in distance numerators)
 *   - indicator values are read from the bar CONTAINING
 *     the first entry fill timestamp
 *
 * Entry-side detection: for `side: 'long'` trades, entry-
 * side fills carry `side: 'B'`. For `side: 'short'` trades,
 * entry-side fills carry `side: 'S'`. The trade's `side`
 * field disambiguates.
 *
 * Inputs:
 *   - trade: hydrated trade with side + executions array
 *   - warmupBars: prior-day 1M bars (from intraday_bars
 *     cache). May be empty for legacy rows; the function
 *     degrades gracefully (MACD/EMA under-converged but
 *     workable, data_complete may still be true if all
 *     reads succeed).
 *   - activeBars: active-day 1M bars (from intraday_bars
 *     cache).
 *
 * Returns the TradeTechnicals snapshot. data_complete is
 * true iff BOTH 1M and 5M snapshots could be located.
 * (Either timeframe missing → data_complete = false; the
 * snapshot fields remain null on the missing side.)
 *
 * Pure module — no Electron / DB imports. Caller pairs
 * the returned snapshot with trade_id externally for the
 * trade_technicals table upsert.
 */
export function computeTradeTechnicals(
  trade: TradeForTechnicals,
  warmupBars: IntradayBar[],
  activeBars: IntradayBar[],
): TradeTechnicals {
  // Entry-side detection.
  const entrySide: 'B' | 'S' = trade.side === 'long' ? 'B' : 'S'
  const entryFills = trade.executions.filter((e) => e.side === entrySide)

  // Defensive: no entry-side fills means the trade record
  // is malformed (impossible per RoundTrip definition,
  // but guard anyway). Return all-nulls + data_complete
  // false rather than throwing.
  if (entryFills.length === 0) {
    return {
      tf_1m: emptySnapshot(),
      tf_5m: emptySnapshot(),
      data_complete: false,
      computed_at: new Date().toISOString(),
      schema_version: TECHNICALS_SCHEMA_VERSION,
    }
  }

  // Vol-weighted entry price.
  let totalNotional = 0
  let totalQty = 0
  for (const f of entryFills) {
    totalNotional += f.price * f.qty
    totalQty += f.qty
  }
  const entryPriceVwa = totalQty > 0 ? totalNotional / totalQty : 0

  // First entry fill timestamp — min(time) over entry-
  // side fills. Time is ISO-8601 UTC, so string compare
  // sorts correctly, but parse to ms for the bar-locator
  // comparison (which uses epoch ms).
  let firstFillTime = entryFills[0].time
  for (const f of entryFills) {
    if (f.time < firstFillTime) firstFillTime = f.time
  }
  const fillTimeMs = new Date(firstFillTime).getTime()

  // 1M snapshot — operates on raw 1-minute bars.
  const tf_1m = computeSnapshot(
    warmupBars,
    activeBars,
    entryPriceVwa,
    fillTimeMs,
    60_000,
  )

  // 5M snapshot — operates on 5-minute-aggregated bars.
  // Aggregation happens on the UNION so any bucket
  // straddling the warmup/active boundary aggregates
  // correctly (in practice the overnight gap prevents
  // straddling; matches Session 1 computeMacdWithWarmup
  // logic).
  const unionBars = [...warmupBars, ...activeBars]
  const union5m = aggregate(unionBars, 5)
  // Split union5m back into warmup5m + active5m by the
  // active-day start. The boundary is the first active
  // bar's timestamp.
  const activeStart = activeBars.length > 0 ? activeBars[0].t : Infinity
  const warmup5m: IntradayBar[] = []
  const active5m: IntradayBar[] = []
  for (const b of union5m) {
    if (b.t < activeStart) warmup5m.push(b)
    else active5m.push(b)
  }
  const tf_5m = computeSnapshot(
    warmup5m,
    active5m,
    entryPriceVwa,
    fillTimeMs,
    300_000,
  )

  return {
    tf_1m: tf_1m ?? emptySnapshot(),
    tf_5m: tf_5m ?? emptySnapshot(),
    data_complete: tf_1m !== null && tf_5m !== null,
    computed_at: new Date().toISOString(),
    schema_version: TECHNICALS_SCHEMA_VERSION,
  }
}

/**
 * Build a placeholder TradeTechnicals for a trade whose indicator
 * values cannot be computed — typically because intraday bars are
 * not cached for the trade's (symbol, date) yet. The row exists with
 * data_complete = false so Session 4's UI can surface "computed N of
 * M trades" honestly rather than the trade silently disappearing.
 *
 * Stamps schema_version to the current TECHNICALS_SCHEMA_VERSION so
 * a future schema bump will mark these rows stale (alongside missing
 * rows and previously-failed rows) via getStaleTradeIds, giving them
 * another chance to compute on the next bulk pass.
 */
export function makeIncompleteTechnicals(): TradeTechnicals {
  const nullSnapshot: TechnicalSnapshot = {
    macd_line: null,
    signal_line: null,
    histogram: null,
    histogram_prior: null,
    macd_positive: null,
    macd_open: null,
    macd_rising: null,
    vwap: null,
    vwap_dist_pct: null,
    ema9: null,
    ema9_dist_pct: null,
    ema20: null,
    ema20_dist_pct: null,
    ema9_above_ema20: null,
  }
  return {
    tf_1m: { ...nullSnapshot },
    tf_5m: { ...nullSnapshot },
    data_complete: false,
    computed_at: new Date().toISOString(),
    schema_version: TECHNICALS_SCHEMA_VERSION,
  }
}

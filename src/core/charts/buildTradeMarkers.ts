// Pure marker-building for the per-trade candlestick chart (v0.2.4 chart
// redesign). Render-lib-agnostic: emits neutral descriptors the ChartTab host
// later maps onto lightweight-charts markers / price lines. Per ARCHITECTURE
// rule 1 this module is pure — no electron / fs / node / lightweight-charts
// imports, types only from @shared/*.
//
// It consolidates logic currently inlined in src/components/trades/ChartTab.tsx
// (buildFillMarkers, the avg entry/exit price-line math, computeEntryEma9Pct,
// nearest) into one testable unit. Conventions are mirrored deliberately:
//   - fill→bar snapping mirrors nearest() in ChartTab.tsx (same tie-break:
//     on an exact tie the LATER bar wins).
//   - ema9DistancePct mirrors computeEntryEma9Pct (ChartTab.tsx) and its
//     server twin computeEma9Distance (electron/market/intraday.ts): latest
//     indicator point with time <= the fill epoch, then percentage distance.
//   - share-weighted averages mirror the avg() helper in ChartTab's price-line
//     effect: Σ(price·qty) / Σqty over the side's fills.

import type { TradeListRow } from '@shared/trades-types'
import type { RoundTripExecution } from '@shared/import-types'
import type { IntradayBar } from '@shared/market-types'

export type MarkerKind = 'entry' | 'exit'

/** A sampled indicator value (EMA9 / VWAP) at a bar time. `time` is epoch ms,
 *  matching IntradayBar.t; series are assumed sorted ascending by time. */
export interface IndicatorPoint {
  time: number
  value: number
}

/** Per-fill hover stats. Null when the indicator series has no point at or
 *  before the fill, or the reference value is 0 (avoids divide-by-zero). */
export interface TradeMarkerHover {
  /** ((fill price − VWAP at fill) / VWAP at fill) × 100. */
  pctFromVwap: number | null
  /** ((fill price − EMA9 at fill) / EMA9 at fill) × 100 — same convention as
   *  the per-trade entry_ema9_distance_pct column. */
  ema9DistancePct: number | null
}

export interface TradeMarker {
  /** Epoch ms of the bar nearest the fill (snap target for placement). */
  time: number
  /** The fill's exact price, unchanged — for price-based vertical placement. */
  price: number
  /** Role by trade direction: long ⇒ B=entry/S=exit; short ⇒ S=entry/B=exit. */
  kind: MarkerKind
  /** Raw execution side. */
  side: 'B' | 'S'
  /** Fill quantity (shares). */
  qty: number
  /** Visual size, strictly increasing in qty (bounded). */
  size: number
  hover: TradeMarkerHover
}

export interface BuildTradeMarkersOptions {
  /** EMA9 series for per-fill distance hover. Omitted ⇒ ema9DistancePct null. */
  ema9?: IndicatorPoint[]
  /** VWAP series for per-fill distance hover. Omitted ⇒ pctFromVwap null. */
  vwap?: IndicatorPoint[]
}

export interface TradeMarkersResult {
  markers: TradeMarker[]
  /** Share-weighted average of the entry-side fills; null when none. */
  avgEntry: number | null
  /** Share-weighted average of the exit-side fills; null when none. */
  avgExit: number | null
}

// Marker-size curve: q / (q + SCALE) is strictly increasing on q ≥ 0 and
// saturates toward 1, so size stays bounded in [MIN, MAX). The tests assert
// ordering (bigger qty ⇒ bigger size), not exact values; SCALE just sets where
// the curve is roughly half-way for typical small-cap share counts.
const MARKER_MIN_SIZE = 1
const MARKER_MAX_SIZE = 4
const MARKER_QTY_SCALE = 1000

function markerSize(qty: number): number {
  const q = qty > 0 ? qty : 0
  const t = q / (q + MARKER_QTY_SCALE)
  return MARKER_MIN_SIZE + (MARKER_MAX_SIZE - MARKER_MIN_SIZE) * t
}

// Parse a fill timestamp to epoch ms. e.time is true UTC with a Z suffix
// (Day 8.5 Commit B); the includes('Z') guard mirrors computeEntryEma9Pct so a
// legacy bare-local string still parses without double-appending Z (which would
// yield NaN). On already-UTC input this equals a plain Date.parse(e.time).
function fillEpochMs(time: string): number {
  return Date.parse(time.includes('Z') ? time : `${time}Z`)
}

// Nearest bar time (epoch ms) to a target epoch. Direct mirror of nearest() in
// ChartTab.tsx, operating in ms instead of seconds: lower-bound binary search,
// then pick the strictly-closer left neighbour — so an exact tie keeps the
// later bar. Assumes barTimes is sorted ascending.
function nearestBarTime(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return target
  let lo = 0
  let hi = barTimes.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (barTimes[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(barTimes[lo - 1] - target) < Math.abs(barTimes[lo] - target)) {
    return barTimes[lo - 1]
  }
  return barTimes[lo]
}

// Latest indicator value with time <= epoch. Walk-forward-then-break mirrors
// computeEntryEma9Pct and relies on the series being sorted ascending.
function valueAtOrBefore(series: IndicatorPoint[], epoch: number): number | null {
  let chosen: IndicatorPoint | null = null
  for (const p of series) {
    if (p.time <= epoch) chosen = p
    else break
  }
  return chosen ? chosen.value : null
}

// Percentage distance of price from a reference level. Null when the reference
// is absent or 0 — matches the `chosen.value === 0` guard in computeEntryEma9Pct.
function pctDistance(price: number, ref: number | null): number | null {
  if (ref === null || ref === 0) return null
  return ((price - ref) / ref) * 100
}

// Share-weighted mean price of a set of fills: Σ(price·qty) / Σqty. Null when
// the set is empty or carries no quantity. Mirrors the avg() helper in
// ChartTab's avg entry/exit price-line effect.
function weightedAvgPrice(fills: RoundTripExecution[]): number | null {
  if (fills.length === 0) return null
  let dollars = 0
  let qty = 0
  for (const f of fills) {
    dollars += f.price * f.qty
    qty += f.qty
  }
  return qty > 0 ? dollars / qty : null
}

/**
 * Build render-agnostic entry/exit markers and the share-weighted average
 * entry/exit levels for a trade, snapping each fill to the nearest intraday bar
 * and deriving per-fill EMA9 / VWAP distance for the hover payload.
 */
export function buildTradeMarkers(
  trade: TradeListRow,
  bars: IntradayBar[],
  opts: BuildTradeMarkersOptions = {},
): TradeMarkersResult {
  const ema9 = opts.ema9 ?? []
  const vwap = opts.vwap ?? []
  const barTimes = bars.map((b) => b.t)

  // Role is by trade direction, not raw side: a short is opened by selling and
  // closed by buying back.
  const entrySide: 'B' | 'S' = trade.side === 'short' ? 'S' : 'B'

  const markers: TradeMarker[] = []
  for (const e of trade.executions) {
    const epoch = fillEpochMs(e.time)
    // Drop unparseable timestamps rather than emit a NaN-timed marker — mirrors
    // buildFillMarkers' Number.isFinite guard.
    if (!Number.isFinite(epoch)) continue

    markers.push({
      time: nearestBarTime(barTimes, epoch),
      price: e.price,
      kind: e.side === entrySide ? 'entry' : 'exit',
      side: e.side,
      qty: e.qty,
      size: markerSize(e.qty),
      hover: {
        ema9DistancePct: pctDistance(e.price, valueAtOrBefore(ema9, epoch)),
        pctFromVwap: pctDistance(e.price, valueAtOrBefore(vwap, epoch)),
      },
    })
  }

  // Lightweight-charts requires markers sorted ascending by time; the host
  // consumes them directly. Array.sort is stable, so fills snapping to the same
  // bar keep their original order.
  markers.sort((a, b) => a.time - b.time)

  const entryFills = trade.executions.filter((e) => e.side === entrySide)
  const exitFills = trade.executions.filter((e) => e.side !== entrySide)

  return {
    markers,
    avgEntry: weightedAvgPrice(entryFills),
    avgExit: weightedAvgPrice(exitFills),
  }
}

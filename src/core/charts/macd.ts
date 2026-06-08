// Pure MACD computation for the per-trade chart's indicator sub-pane (v0.2.4).
// MACD line = EMA(fast) - EMA(slow) of close; signal = EMA(signalPeriod) of the
// MACD line; histogram = MACD - signal. Classic 12/26/9. The caller always feeds
// the raw 1-minute bars — this module is timeframe-agnostic.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / sqlite / lightweight-charts /
// React imports — just math, so it stays unit-testable and web-portable. The EMA
// helper is the shared, SMA-seeded `./ema` module (also consumed by Session 2's
// computeTradeTechnicals), so the MACD sub-pane and the EMA9/EMA20 overlays stay
// on one convention.

import type { IntradayBar } from '@shared/market-types'
import { ema } from './ema'

export interface MacdPoint {
  /** Epoch ms, copied from the source bar. */
  time: number
  value: number
}

export type HistogramMomentum =
  | 'pos_rising'
  | 'pos_falling'
  | 'neg_rising'
  | 'neg_falling'

export interface MacdHistogramPoint {
  time: number
  value: number
  /** Direction of the histogram's change relative to zero — the trader read:
   *  'rising' = growing in the direction of its sign (momentum strengthening),
   *  'falling' = weakening toward zero. */
  momentum: HistogramMomentum
}

export interface MacdResult {
  macd: MacdPoint[]
  signal: MacdPoint[]
  histogram: MacdHistogramPoint[]
}

// Tag a histogram point by the direction of its change relative to zero. `prior`
// is the previous index's histogram value (null at the first point or a gap).
// 'rising' = histogram growing in its sign's direction; 'falling' = toward zero.
function tagMomentum(current: number, prior: number | null): HistogramMomentum {
  if (current >= 0) {
    return prior === null || current >= prior ? 'pos_rising' : 'pos_falling'
  }
  return prior === null || current <= prior ? 'neg_falling' : 'neg_rising'
}

/**
 * Classic MACD (default 12/26/9) over the bars' closes. Returns dense arrays (no
 * null holes); each point carries the source bar's epoch-ms `time`. Returns
 * all-empty (never throws) when there is not enough data for a single signal
 * point (bars.length < slowPeriod + signalPeriod) or no bars.
 */
export function computeMacd(
  bars: IntradayBar[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  if (bars.length < slowPeriod + signalPeriod) {
    return { macd: [], signal: [], histogram: [] }
  }

  const closes = bars.map((b) => b.c)
  const emaFast = ema(closes, fastPeriod)
  const emaSlow = ema(closes, slowPeriod)

  // MACD line, index-aligned with bars (null where either EMA is null).
  const macdLine: (number | null)[] = new Array<number | null>(bars.length).fill(null)
  for (let i = 0; i < bars.length; i++) {
    const f = emaFast[i]
    const s = emaSlow[i]
    if (f !== null && s !== null) macdLine[i] = f - s
  }

  // Signal = EMA(signalPeriod) of the MACD line. Run it on the DENSE macd values
  // (no nulls), then re-align back to the full index space by re-prefixing nulls.
  const firstMacdIdx = macdLine.findIndex((v) => v !== null)
  const denseMacd: number[] = []
  for (const v of macdLine) if (v !== null) denseMacd.push(v)
  const denseSignal = ema(denseMacd, signalPeriod)
  const signalLine: (number | null)[] = new Array<number | null>(bars.length).fill(null)
  if (firstMacdIdx !== -1) {
    for (let j = 0; j < denseSignal.length; j++) {
      signalLine[firstMacdIdx + j] = denseSignal[j]
    }
  }

  // Histogram = MACD - signal, index-aligned (null where either is null).
  const histLine: (number | null)[] = new Array<number | null>(bars.length).fill(null)
  for (let i = 0; i < bars.length; i++) {
    const m = macdLine[i]
    const s = signalLine[i]
    if (m !== null && s !== null) histLine[i] = m - s
  }

  // Assemble dense result arrays, copying the source bar time and tagging the
  // histogram momentum against the previous index's value.
  const macd: MacdPoint[] = []
  for (let i = 0; i < macdLine.length; i++) {
    const v = macdLine[i]
    if (v !== null) macd.push({ time: bars[i].t, value: v })
  }
  const signal: MacdPoint[] = []
  for (let i = 0; i < signalLine.length; i++) {
    const v = signalLine[i]
    if (v !== null) signal.push({ time: bars[i].t, value: v })
  }
  const histogram: MacdHistogramPoint[] = []
  for (let i = 0; i < histLine.length; i++) {
    const v = histLine[i]
    if (v === null) continue
    const prior = i > 0 ? histLine[i - 1] : null
    histogram.push({ time: bars[i].t, value: v, momentum: tagMomentum(v, prior) })
  }

  return { macd, signal, histogram }
}

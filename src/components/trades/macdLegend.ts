// The MACD pane legend's pure half (Dave #13) — the fallback, the gate, the
// pane-top offset mapping, and the label for the pane-anchored readout in
// ChartTab. Component-adjacent (the fillLadderPrimitive convention): pure TS,
// no chart/DOM imports, so the pins in __tests__/macdLegend.test.ts run
// without lightweight-charts.
//
// The readout itself is a DOM overlay (a sibling of the canvas, like
// ChartOverlay) — NOT a canvas primitive, per the standing GPU-stall
// constraint from the fill-ladder work.

import type { HistogramMomentum, MacdResult } from '@/core/charts/macd'

/** The hovered bar's three readings (null field = the value doesn't exist at
 *  that bar, e.g. a warmup edge — rendered as an em-dash, never swapped). */
export interface MacdLegendValues {
  line: number | null
  signal: number | null
  histogram: number | null
}

/** Last point's value, or null when the array is empty (warmup-short or the
 *  pane is off). Null renders an em-dash — never 0.00. */
export function lastPointValue(
  points: readonly { time: number; value: number }[],
): number | null {
  if (points.length === 0) return null
  return points[points.length - 1].value
}

/** The display trio: the hovered readings while the crosshair is on a bar,
 *  else the latest computed values (the ChartOverlay fallback convention).
 *  A hovered-but-null FIELD stays null — honesty over continuity. */
export function macdLegendDisplay(
  hovered: MacdLegendValues | null,
  result: MacdResult,
): MacdLegendValues {
  if (hovered) return hovered
  return {
    line: lastPointValue(result.macd),
    signal: lastPointValue(result.signal),
    histogram: lastPointValue(result.histogram),
  }
}

/** The pane-1 block renders only when MACD has real points — it lives and
 *  dies with r.macd (toggle-off / 10S-Daily / warmup-empty all pass
 *  EMPTY_MACD, whose macd array is empty). */
export function showMacdLegend(result: MacdResult): boolean {
  return result.macd.length > 0
}

/** Momentum tag of the LAST histogram point — colors the fallback value the
 *  same way the hovered datum's own series color does. Null when empty. */
export function lastHistogramMomentum(result: MacdResult): HistogramMomentum | null {
  const h = result.histogram
  if (h.length === 0) return null
  return h[h.length - 1].momentum
}

/** Absolute `top` (px) for the pane-1 legend inside the chart's relative
 *  wrapper: pane-0's measured height (IPaneApi.getHeight) plus the pane
 *  separator + a small visual pad. The measurement re-runs on every trigger
 *  that can move the pane boundary — see the ChartTab wiring. */
export function macdLegendTop(pane0Height: number): number {
  return pane0Height + 6
}

/** TradingView-style tag: the indicator, its 12/26/9 params, and the active
 *  timeframe parenthetical (the tfLabel the price legend already uses). */
export function macdLegendLabel(tfLabel: string): string {
  return `MACD 12 26 9 (${tfLabel})`
}

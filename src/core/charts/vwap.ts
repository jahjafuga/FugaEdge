// Pure per ARCHITECTURE rule 1: no electron / fs / db imports
import type { IntradayBar } from '@shared/market-types'

/**
 * Day VWAP — typical price `hlc3 = (H + L + C) / 3`,
 * cumulative `Σ(hlc3 × volume) / Σ(volume)` anchored at the
 * FIRST BAR of the input (premarket included), reset daily.
 *
 * ANCHOR (v0.2.5, reverses the v0.2.4 §A9 regular-session-
 * open gate): the accumulation starts at the first bar of
 * the active day — the same anchor the trade chart's own
 * VWAP overlay draws (ChartTab.tsx:2030) and the one
 * momentum platforms show with extended hours on. Under the
 * old gate, every premarket entry carried a NULL snapshot
 * VWAP while the chart drew a VWAP line on the same trade —
 * two answers under one name (djsevans87 ticket #5: 421 of
 * 534 data-complete trades held NULL).
 *
 * INPUT CONTRACT: `bars` must be the ACTIVE DAY only
 * (no warmup bars). Warmup-union input would anchor VWAP
 * days ago and be completely wrong. The caller's job is
 * to filter to active-day bars before calling.
 *
 * Returns one VWAP value per input bar; result array length
 * equals input length. Values are always numbers — the only
 * degenerate (every accumulated bar zero-volume) falls back
 * to the bar's own typical price rather than emitting NaN.
 *
 * > Single-active-day input only. The function does NOT
 * > reset accumulators across day boundaries — passing
 * > multi-day input would produce a cumulative running
 * > value across the union. Callers (computeTradeTechnicals)
 * > always pass a single active day.
 */
export function vwap(bars: IntradayBar[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  let cumPV = 0
  let cumV = 0
  for (const b of bars) {
    const hlc3 = (b.h + b.l + b.c) / 3
    cumPV += hlc3 * b.v
    cumV += b.v
    // cumV === 0 only when every accumulated bar so far had zero volume —
    // fall back to this bar's typical price rather than emit NaN.
    out.push({ time: b.t, value: cumV > 0 ? cumPV / cumV : hlc3 })
  }
  return out
}

// Pure "zoom to trade" window math for the per-trade candlestick chart (v0.2.4).
// Generalizes FitToFillsButton's window logic (src/components/trades/ChartTab.tsx)
// from a fixed ±30-minute pad to DURATION-RELATIVE padding clamped to the data
// range, so a 30-second scalp and a 3-hour swing each get a sensibly framed
// default view instead of fitContent() showing the whole fetched day.
//
// Pure (ARCHITECTURE rule 1): no electron / fs / node / lightweight-charts;
// types from @shared/* only. Emits epoch MS — the caller converts to the
// chart's epoch seconds via secondsTime(), same as buildTradeMarkers emits ms.

import type { IntradayBar } from '@shared/market-types'

export interface ZoomWindow {
  fromMs: number
  toMs: number
}

export interface ComputeZoomWindowOptions {
  /** Fraction of the trade duration padded onto EACH side. */
  padFraction?: number
  /** Floor for the per-side pad (ms) — dominates for short/instant trades. */
  minPadMs?: number
  /** Active timeframe's bar interval in ms (caller passes 60000 for 1M, 300000
   *  for 5M). Accepted for caller / logical-range API compatibility but NOT used
   *  by the window math any more — the window is framed by TIME, so candle count
   *  falls out of the interval rather than driving the pad. */
  barIntervalMs?: number
  /** No longer used by the window math (the `minBars * barIntervalMs` floor was
   *  removed for interval-independence). Retained so existing callers that still
   *  pass it keep type-checking; accepted and ignored. */
  minBars?: number
}

const DEFAULT_PAD_FRACTION = 0.55
const DEFAULT_MIN_PAD_MS = 360_000 // 6 min (flat floor — was contributed by the 6-bar term at 1M)

// Parse a fill timestamp to epoch ms. Mirrors buildTradeMarkers.fillEpochMs:
// e.time is true UTC with a Z suffix (Day 8.5 Commit B); the includes('Z')
// guard tolerates a legacy bare-local string without double-appending Z (which
// would yield NaN). On already-UTC input this equals a plain Date.parse.
function fillEpochMs(time: string): number {
  return Date.parse(time.includes('Z') ? time : `${time}Z`)
}

/**
 * Compute the default visible window for a trade: the fills' span padded on both
 * sides by `max(duration * padFraction, minPadMs)`, clamped to the bars'
 * available range. The window is framed purely by TIME — the trade's fills plus
 * a duration-relative pad with a flat minPadMs floor — and is INDEPENDENT of the
 * bar interval: switching timeframes changes candle granularity, not which slice
 * of time is shown. Returns null when there are no bars or no parseable fills
 * (caller falls back to fitContent()).
 */
export function computeZoomWindow(
  fills: { time: string }[],
  bars: IntradayBar[],
  opts: ComputeZoomWindowOptions = {},
): ZoomWindow | null {
  if (bars.length === 0) return null

  const epochs = fills
    .map((f) => fillEpochMs(f.time))
    .filter((t) => Number.isFinite(t))
  if (epochs.length === 0) return null

  const padFraction = opts.padFraction ?? DEFAULT_PAD_FRACTION
  const minPadMs = opts.minPadMs ?? DEFAULT_MIN_PAD_MS

  const minFill = Math.min(...epochs)
  const maxFill = Math.max(...epochs)
  const duration = maxFill - minFill
  // Per-side pad: proportional to the trade duration, floored at minPadMs (6 min)
  // so short/instant trades still get a sane window. Bar-interval-INDEPENDENT by
  // design — the candle count falls out of the interval; it does not drive the
  // window. See the barIntervalMs / minBars notes on ComputeZoomWindowOptions.
  const pad = Math.max(duration * padFraction, minPadMs)

  const firstBarT = bars[0].t
  const lastBarT = bars[bars.length - 1].t

  const fromMs = Math.max(minFill - pad, firstBarT)
  const toMs = Math.min(maxFill + pad, lastBarT)

  // Clamp inverted (e.g. fills outside the bars range) → show the full span.
  if (fromMs >= toMs) return { fromMs: firstBarT, toMs: lastBarT }

  return { fromMs, toMs }
}

export interface ZoomLogicalRange {
  from: number
  to: number
}

/**
 * The setVisibleLogicalRange counterpart to computeZoomWindow: maps the ms
 * window to FRACTIONAL bar indices. It exists because setVisibleRange
 * (timestamps) corrupts the time scale's scrollPosition when the target window
 * is a small slice far from the bars' right edge (measured: scrollPosition −654
 * on the full-day 5M bars), whereas a logical (bar-index) range frames the bars
 * directly. Emits fractional indices with a padBars margin; negative / past-end
 * values are intentional — lightweight-charts renders them as edge whitespace.
 */
export function computeZoomLogicalRange(
  fills: { time: string }[],
  bars: IntradayBar[],
  opts: ComputeZoomWindowOptions & { padBars?: number } = {},
): ZoomLogicalRange | null {
  const win = computeZoomWindow(fills, bars, opts)
  if (!win) return null

  const padBars = opts.padBars ?? 0.5

  // fromIndex = first bar at/after the window start; toIndex = last bar at/before
  // the window end. bars are ascending by t (same assumption as the rest).
  let fromIndex = bars.findIndex((b) => b.t >= win.fromMs)
  if (fromIndex === -1) fromIndex = bars.length - 1 // window starts after last bar

  let toIndex = -1
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].t <= win.toMs) {
      toIndex = i
      break
    }
  }
  if (toIndex === -1) toIndex = 0 // window ends before first bar

  // Degenerate: the window fell entirely between two bars (fromIndex > toIndex).
  // Collapse both to the bar nearest the window midpoint so we never emit an
  // inverted range.
  if (fromIndex > toIndex) {
    const mid = (win.fromMs + win.toMs) / 2
    let nearest = 0
    let nearestDist = Infinity
    for (let i = 0; i < bars.length; i++) {
      const d = Math.abs(bars[i].t - mid)
      if (d < nearestDist) {
        nearestDist = d
        nearest = i
      }
    }
    fromIndex = nearest
    toIndex = nearest
  }

  return { from: fromIndex - padBars, to: toIndex + padBars }
}

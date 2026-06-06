// Pure price-axis (vertical) framing for the per-trade candlestick chart
// (v0.2.4 Step 0.5 — the price-scale pin). Produces ONE fixed price band that
// every right-scale series (candle + EMA9 + EMA20 + VWAP) returns from its
// autoscaleInfoProvider. Because all series return the SAME band, the scale's
// autoscale union is a constant — it does NOT drift as the user pans/zooms, so a
// future canvas primitive's draw() sees a constant priceToCoordinate every frame
// (freeze-proof). autoScale stays ON, so a double-click axis reset just
// re-consults the providers and snaps back to this band (reset-proof — no manual
// re-assertion).
//
// The band is the union of {bar highs/lows, fills, EMA9/EMA20/VWAP} but ONLY
// across the trade's DEFAULT ZOOM WINDOW (computeZoomWindow's range) — NOT the
// whole fetched day. Scoping to the window stops a momentum runner's later spike
// (e.g. STI ran $5→$38 hours after a $16 scalp) from squashing the trade to a
// 1%-tall sliver, while still containing every right-scale series in the default
// review view. In-window indicator values are included EXPLICITLY: a lagging
// EMA/VWAP can dip below the in-window bar low (measured on STI: indicator 12.37
// vs in-window bar low 14.42), so bar-extent alone would clip it.
//
// Pure (ARCHITECTURE rule 1): no electron / fs / sqlite / lightweight-charts —
// just math, so it stays unit-testable and web-portable.

export interface PriceRange {
  minValue: number
  maxValue: number
}

/** A time-stamped indicator point. `time` is epoch MS — same unit as bars[].t
 *  and the window bounds — so all three filter by the same comparison. */
export interface TimedValue {
  time: number
  value: number
}

/** Minimal bar shape the band needs (epoch-ms key + high/low). */
export interface BandBar {
  t: number
  h: number
  l: number
}

export interface FramedBandInput {
  /** All loaded bars for the active timeframe. Only in-window bars contribute. */
  bars: readonly BandBar[]
  /** Fill prices — included unconditionally (they define the window, so they are
   *  in it by construction, and the trader always wants their fills in view). */
  fillPrices: readonly number[]
  /** Ungated EMA9 / EMA20 / VWAP series (epoch-ms keyed). Pass the UNGATED series
   *  so toggling a line on/off does NOT resize the scale; null entries are
   *  skipped. Only in-window points contribute. */
  indicatorSeries: ReadonlyArray<readonly TimedValue[] | null>
  /** The trade's default zoom window in epoch ms (from computeZoomWindow) — the
   *  SAME window the time axis frames to. */
  window: { fromMs: number; toMs: number }
}

export interface ComputePriceRangeOptions {
  /** Pad each side by max(span * padRatio, mid * minPadFraction). Small — the
   *  right-scale scaleMargins add the rest of the visual breathing room. */
  padRatio?: number
  /** Floor pad fraction — keeps a near-flat band (a scalp where everything ≈
   *  equal) from collapsing to a sliver. */
  minPadFraction?: number
}

const DEFAULT_PAD_RATIO = 0.06
const DEFAULT_MIN_PAD_FRACTION = 0.01

/**
 * The fixed price band over the union of {in-window bar H/L, fills, in-window
 * EMA9/EMA20/VWAP}, padded. Returns null only when NOTHING falls in the window
 * (no in-window bars, no fills, no in-window indicator points) — the caller then
 * defers to the chart's own autoscale via base().
 */
export function computeFramedBand(
  input: FramedBandInput,
  opts: ComputePriceRangeOptions = {},
): PriceRange | null {
  const { bars, fillPrices, indicatorSeries, window } = input
  const { fromMs, toMs } = window

  let min = Infinity
  let max = -Infinity
  const consider = (v: number) => {
    if (v < min) min = v
    if (v > max) max = v
  }

  // In-window bar highs/lows.
  for (const b of bars) {
    if (b.t < fromMs || b.t > toMs) continue
    consider(b.h)
    consider(b.l)
  }
  // Fills — unconditional (in-window by construction).
  for (const p of fillPrices) consider(p)
  // In-window indicator values (ungated; skip null series).
  for (const series of indicatorSeries) {
    if (!series) continue
    for (const pt of series) {
      if (pt.time < fromMs || pt.time > toMs) continue
      consider(pt.value)
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null

  const padRatio = opts.padRatio ?? DEFAULT_PAD_RATIO
  const minPadFraction = opts.minPadFraction ?? DEFAULT_MIN_PAD_FRACTION
  const span = max - min
  const mid = (min + max) / 2
  const pad = Math.max(span * padRatio, mid * minPadFraction)

  return { minValue: min - pad, maxValue: max + pad }
}

// Pure price-axis (vertical) framing for the per-trade candlestick chart
// (v0.2.4). Builds a price range tightly around the trade's FILLS — option A:
// the fills are the subject, so a runner extending above the view is intended
// (full context lives on 1M / scroll-out). Fed to the candle series via
// autoscaleInfoProvider in ChartTab, which is consulted on EVERY autoscale
// recompute — so the framing is persistent (no re-assertion loop, unlike the
// time axis).
//
// Pure (ARCHITECTURE rule 1): no electron / fs / sqlite / lightweight-charts —
// just math.

export interface PriceRange {
  minValue: number
  maxValue: number
}

export interface ComputePriceRangeOptions {
  /** Pad applied to EACH side = fillBand * padRatio. */
  padRatio?: number
  /** Floor pad = fillMid * minPadFraction — keeps near-coincident fills (a
   *  scalp where entry ≈ exit, fillBand ≈ 0) from collapsing to a sliver. */
  minPadFraction?: number
}

const DEFAULT_PAD_RATIO = 1.0
const DEFAULT_MIN_PAD_FRACTION = 0.01

/**
 * Frame the price axis around the fills: `[fillMin − pad, fillMax + pad]`, where
 * `pad = max(fillBand * padRatio, fillMid * minPadFraction)`. The proportional
 * term sizes the window to the fill spread; the floor term keeps a sane window
 * when the fills are near-coincident. Returns null for an empty fill set
 * (caller should fall back to the chart's default autoscale).
 */
export function computePriceRange(
  fillPrices: number[],
  opts: ComputePriceRangeOptions = {},
): PriceRange | null {
  if (fillPrices.length === 0) return null

  const padRatio = opts.padRatio ?? DEFAULT_PAD_RATIO
  const minPadFraction = opts.minPadFraction ?? DEFAULT_MIN_PAD_FRACTION

  const fillMin = Math.min(...fillPrices)
  const fillMax = Math.max(...fillPrices)
  const fillBand = fillMax - fillMin
  const fillMid = (fillMin + fillMax) / 2

  const pad = Math.max(fillBand * padRatio, fillMid * minPadFraction)

  return { minValue: fillMin - pad, maxValue: fillMax + pad }
}

import type { OccupancyRect } from './fillLadderLayout'

export interface IntradayBarLike {
  t: number // epoch ms
  h: number // high price
  l: number // low price
}

export interface BuildOccupancyOpts {
  paneWidth: number
  paneHeight: number
  bandThickness: number
}

const BODY_FRACTION = 0.7      // candle body spans this fraction of the bar pitch
const DEFAULT_CANDLE_W = 8     // px: fallback body width when pitch is unknowable (single/lone on-screen bar)

// Pure: turns visible candles + the trade's avg-entry/avg-exit prices into
// occupancy rects/bands for layoutFillLadder. Chart-coupled coordinate
// conversion is passed IN as toX/toY (so this imports nothing chart-specific
// and ports to the web target unchanged). Off-screen bars/prices (toX|toY
// returns null) are skipped.
export function buildOccupancy(
  bars: IntradayBarLike[],
  avgEntry: number | null,
  avgExit: number | null,
  toX: (timeMs: number) => number | null,
  toY: (price: number) => number | null,
  opts: BuildOccupancyOpts,
): { candleRects: OccupancyRect[]; avgBands: { y: number; h: number }[] } {
  const candleRects: OccupancyRect[] = []

  // One representative pitch for all candles: intraday bars are evenly spaced in
  // time, so the pixel pitch is constant across the visible range. Find the first
  // adjacent pair where BOTH bars are on-screen and measure their center gap.
  let pitch: number | null = null
  for (let i = 0; i < bars.length - 1; i++) {
    const xa = toX(bars[i].t)
    const xb = toX(bars[i + 1].t)
    if (xa !== null && xb !== null) {
      pitch = Math.abs(xb - xa)
      break
    }
  }
  const bodyW = pitch !== null ? pitch * BODY_FRACTION : DEFAULT_CANDLE_W

  // One rect per ON-SCREEN bar: centered on toX(t), body width, spanning
  // toY(high) (top, smaller y) to toY(low) (bottom). Skip any bar whose x or
  // price coords are off-screen (null).
  for (const b of bars) {
    const xc = toX(b.t)
    const yHigh = toY(b.h)
    const yLow = toY(b.l)
    if (xc === null || yHigh === null || yLow === null) continue
    candleRects.push({ x: xc - bodyW / 2, y: yHigh, w: bodyW, h: yLow - yHigh })
  }

  // Avg-entry / avg-exit bands: a thin horizontal band at toY(price) for each
  // non-null avg. (Per design: pills dodge only these two lines, not EMA/VWAP.)
  const avgBands: { y: number; h: number }[] = []
  for (const p of [avgEntry, avgExit]) {
    if (p === null) continue
    const y = toY(p)
    if (y === null) continue
    avgBands.push({ y, h: opts.bandThickness })
  }

  return { candleRects, avgBands }
}

import { describe, it, expect } from 'vitest'
import { buildOccupancy, type IntradayBarLike } from '../buildOccupancy'

const toX = (t: number): number | null => t / 1000          // 60000ms -> 60px, pitch 60
const toY = (p: number): number | null => 400 - p * 20      // higher price -> smaller y
const OPTS = { paneWidth: 600, paneHeight: 400, bandThickness: 6 }
const bar = (t: number, h: number, l: number): IntradayBarLike => ({ t, h, l })

describe('buildOccupancy — candle rects', () => {
  it('builds one rect per bar, top = toY(high), positive height = toY(low) - toY(high)', () => {
    const bars = [bar(0, 5.1, 5.0), bar(60000, 5.2, 5.05)]
    const { candleRects } = buildOccupancy(bars, null, null, toX, toY, OPTS)
    expect(candleRects).toHaveLength(2)
    // bar 0: high 5.1 -> y 298, low 5.0 -> y 300; top=298, h=2
    expect(candleRects[0].y).toBeCloseTo(400 - 5.1 * 20, 6)
    expect(candleRects[0].h).toBeCloseTo((400 - 5.0 * 20) - (400 - 5.1 * 20), 6)
    expect(candleRects[0].h).toBeGreaterThan(0)
  })

  it('gives each candle body width from the bar pitch (0.7 of pitch), centered on toX(t)', () => {
    const bars = [bar(0, 5.1, 5.0), bar(60000, 5.2, 5.05), bar(120000, 5.15, 5.1)]
    const { candleRects } = buildOccupancy(bars, null, null, toX, toY, OPTS)
    // pitch = 60px, body = 0.7*60 = 42; rect centered on toX(t) so x = center - 21
    expect(candleRects[1].w).toBeCloseTo(42, 6)
    expect(candleRects[1].x).toBeCloseTo((60000 / 1000) - 21, 6) // center 60, left 39
  })

  it('skips bars whose toX or toY is off-screen (null)', () => {
    const offX = (t: number): number | null => (t === 60000 ? null : t / 1000)
    const bars = [bar(0, 5.1, 5.0), bar(60000, 5.2, 5.05), bar(120000, 5.15, 5.1)]
    const { candleRects } = buildOccupancy(bars, null, null, offX, toY, OPTS)
    expect(candleRects).toHaveLength(2) // the off-screen bar dropped
  })

  it('handles a single bar without crashing (pitch fallback)', () => {
    const { candleRects } = buildOccupancy([bar(0, 5.1, 5.0)], null, null, toX, toY, OPTS)
    expect(candleRects).toHaveLength(1)
    expect(candleRects[0].w).toBeGreaterThan(0) // some default width, not NaN/0
    expect(Number.isFinite(candleRects[0].w)).toBe(true)
  })
})

describe('buildOccupancy — avg bands', () => {
  it('builds a band at toY(price) for each non-null avg, thickness = bandThickness', () => {
    const { avgBands } = buildOccupancy([bar(0, 5.1, 5.0)], 5.0, 5.1, toX, toY, OPTS)
    expect(avgBands).toHaveLength(2)
    const ys = avgBands.map((b) => b.y).sort((a, c) => a - c)
    expect(ys).toContainEqual(expect.closeTo(400 - 5.1 * 20, 6)) // 298
    expect(ys).toContainEqual(expect.closeTo(400 - 5.0 * 20, 6)) // 300
    expect(avgBands[0].h).toBe(6)
  })

  it('builds one band when only one avg is present', () => {
    const { avgBands } = buildOccupancy([bar(0, 5.1, 5.0)], 5.0, null, toX, toY, OPTS)
    expect(avgBands).toHaveLength(1)
    expect(avgBands[0].y).toBeCloseTo(400 - 5.0 * 20, 6)
  })

  it('builds zero bands when both avgs are null', () => {
    const { avgBands } = buildOccupancy([bar(0, 5.1, 5.0)], null, null, toX, toY, OPTS)
    expect(avgBands).toHaveLength(0)
  })
})

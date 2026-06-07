import { describe, it, expect } from 'vitest'
import { assembleLadderFrame } from '../assembleLadderFrame'
import type { TradeMarker } from '@/core/charts/buildTradeMarkers'
import type { IntradayBarLike } from '../buildOccupancy'

const toX = (t: number): number | null => t / 1000
const toY = (p: number): number | null => 400 - p * 20
const OPTS = {
  paneWidth: 600, paneHeight: 400, pillWidth: 58, pillHeight: 16,
  minGap: 4, leaderMin: 12, leaderMax: 140, bandThickness: 6,
}
// Helper to build a marker — matches the REAL TradeMarker type (includes the
// required `hover` field, which the original assumed shape omitted).
const mk = (over: Partial<TradeMarker>): TradeMarker => ({
  time: 300000, price: 5.0, qty: 100, kind: 'exit', side: 'S', size: 2,
  hover: { pctFromVwap: null, ema9DistancePct: null }, ...over,
} as TradeMarker)
const noBars: IntradayBarLike[] = []

describe('assembleLadderFrame — output structure', () => {
  it('produces one dot, one leader, one pill per marker', () => {
    const f = assembleLadderFrame([mk({}), mk({ time: 360000 })], noBars, null, null, toX, toY, OPTS)
    expect(f.dots).toHaveLength(2)
    expect(f.leaders).toHaveLength(2)
    expect(f.pills).toHaveLength(2)
  })

  it('places the dot at the true fill coordinate (toX(time), toY(price))', () => {
    const f = assembleLadderFrame([mk({ time: 300000, price: 5.0 })], noBars, null, null, toX, toY, OPTS)
    expect(f.dots[0].x).toBeCloseTo(300000 / 1000, 6)     // 300
    expect(f.dots[0].y).toBeCloseTo(400 - 5.0 * 20, 6)    // 300
  })
})

describe('assembleLadderFrame — flip-aware leader endpoint', () => {
  it('centers the leader endpoint under the dot when the dot is inside the pill span (vertical stub)', () => {
    // One fill → the pill centers on the dot, so the dot sits inside the pill's
    // half-width span. The nearest-edge clamp pins the leader endpoint to the dot x
    // (a vertical stub from the dot to the pill center) — no left/right routing.
    const f = assembleLadderFrame([mk({ kind: 'entry', side: 'B' })], noBars, null, null, toX, toY, OPTS)
    const dot = f.dots[0]
    const pill = f.pills[0]
    const leader = f.leaders[0]
    expect(pill.cx).toBeCloseTo(dot.x, 6)     // pill centered on the dot
    expect(leader.x2).toBeCloseTo(dot.x, 6)   // endpoint clamped to the dot x (vertical stub)
    expect(leader.y2).toBeCloseTo(pill.cy, 6) // endpoint y at the pill center
    expect(leader.x1).toBeCloseTo(dot.x, 6)   // leader starts on the dot
    expect(leader.y1).toBeCloseTo(dot.y, 6)
  })

  it.skip('connects the leader to the nearer pill edge when the dot is outside the pill span (Case B)', () => {
    // SKIPPED — Case B (merged multi-bar cluster, outer dot beyond pillX ± halfW). Needs a measured 2-bar fixture; built in Step B Beat 2 after probing real bar-x under OPTS. Do not assert blind.
  })
})

describe('assembleLadderFrame — pill content + width', () => {
  it('pill width matches the layout pillWidth (fixed, not text-measured)', () => {
    const f = assembleLadderFrame([mk({})], noBars, null, null, toX, toY, OPTS)
    expect(f.pills[0].w).toBe(OPTS.pillWidth)
  })

  it('skips markers whose coords are off-screen (toX/toY null)', () => {
    const offX = (t: number): number | null => (t === 360000 ? null : t / 1000)
    const f = assembleLadderFrame([mk({ time: 300000 }), mk({ time: 360000 })], noBars, null, null, offX, toY, OPTS)
    expect(f.dots).toHaveLength(1)
  })

  it('builds the pill label via fillLabel (qty @ price)', () => {
    const f = assembleLadderFrame([mk({ qty: 100, price: 5.0 })], noBars, null, null, toX, toY, OPTS)
    expect(f.pills[0].label).toBe('100 @ 5.00')
  })

  it('carries the fill side on the dot + pill (renderer colors by side, not kind)', () => {
    const f = assembleLadderFrame([mk({ kind: 'entry', side: 'B' })], noBars, null, null, toX, toY, OPTS)
    expect(f.pills[0].side).toBe('B')
    expect(f.dots[0].side).toBe('B')
  })
})

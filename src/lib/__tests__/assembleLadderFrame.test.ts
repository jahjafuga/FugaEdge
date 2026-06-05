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
  it('connects the leader to the pill RIGHT edge when the pill is LEFT of the dot', () => {
    // Force a left pill: exit dot pinned at the right edge with a candle blocking
    // the right side, so the layout flips it left (verified geometry from ee95c43).
    const candle = { t: 0, h: 0, l: 0 } // placeholder; real blocking comes via bars+toY below
    // Simplest deterministic left-pill: an ENTRY marker (entries route LEFT by default).
    const f = assembleLadderFrame([mk({ kind: 'entry', side: 'B' })], noBars, null, null, toX, toY, OPTS)
    const dot = f.dots[0]
    const pill = f.pills[0]
    const leader = f.leaders[0]
    // entry routes left → pill center < dot x → leader endpoint is the pill's RIGHT edge
    expect(pill.cx).toBeLessThan(dot.x)
    expect(leader.x2).toBeCloseTo(pill.cx + OPTS.pillWidth / 2, 6) // right edge
    expect(leader.y2).toBeCloseTo(pill.cy, 6)
    expect(leader.x1).toBeCloseTo(dot.x, 6)
    expect(leader.y1).toBeCloseTo(dot.y, 6)
  })

  it('connects the leader to the pill LEFT edge when the pill is RIGHT of the dot', () => {
    // exit marker → routes RIGHT by default → pill center > dot x → leader endpoint is the pill's LEFT edge
    const f = assembleLadderFrame([mk({ kind: 'exit', side: 'S' })], noBars, null, null, toX, toY, OPTS)
    const dot = f.dots[0]
    const pill = f.pills[0]
    const leader = f.leaders[0]
    expect(pill.cx).toBeGreaterThan(dot.x)
    expect(leader.x2).toBeCloseTo(pill.cx - OPTS.pillWidth / 2, 6) // left edge
    expect(leader.y2).toBeCloseTo(pill.cy, 6)
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
})

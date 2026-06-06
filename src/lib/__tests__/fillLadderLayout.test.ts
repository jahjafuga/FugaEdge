import { describe, it, expect } from 'vitest'
import {
  layoutFillLadder,
  type FillPoint,
  type FillLadderOptions,
  type OccupancyRect,
} from '../fillLadderLayout'

// pillHeight + minGap = the minimum center-to-center distance for two pills that
// share a side+cluster (so the gap between their edges is >= minGap).
const OPTS: FillLadderOptions = {
  paneWidth: 600,
  paneHeight: 400,
  pillWidth: 58,
  pillHeight: 16,
  minGap: 4,
  leaderMin: 12,
  leaderMax: 140,
  candleRects: [],
  avgBands: [],
}
const STEP = OPTS.pillHeight + OPTS.minGap // 20

function fp(x: number, y: number, over: Partial<FillPoint> = {}): FillPoint {
  return { x, y, qty: 100, price: 1, kind: 'entry', side: 'B', ...over }
}
function exit(x: number, y: number, over: Partial<FillPoint> = {}): FillPoint {
  return fp(x, y, { kind: 'exit', side: 'S', ...over })
}
function box(p: { pillX: number; pillY: number }, o: FillLadderOptions = OPTS): OccupancyRect {
  return { x: p.pillX - o.pillWidth / 2, y: p.pillY - o.pillHeight / 2, w: o.pillWidth, h: o.pillHeight }
}
function intersects(a: OccupancyRect, b: OccupancyRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
function clusterGapsOk(pills: { pillY: number }[]): void {
  const ys = pills.map((p) => p.pillY).sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(STEP - 1e-9)
}

describe('layoutFillLadder — role split + free-space (piece 2)', () => {
  it('routes entry pills LEFT of the dot and exit pills RIGHT', () => {
    const placed = layoutFillLadder([fp(300, 200), exit(300, 250)], OPTS)
    expect(placed[0].pillX).toBeLessThan(placed[0].x) // entry → left
    expect(placed[1].pillX).toBeGreaterThan(placed[1].x) // exit → right
  })

  it('places at leaderMin when the spot right there is free (nearest, no over-reach)', () => {
    const placed = layoutFillLadder([exit(300, 200)], OPTS)
    expect(placed[0].pillX).toBe(300 + OPTS.leaderMin + OPTS.pillWidth / 2)
  })

  it('pushes a pill outward past a candle until its box is clear', () => {
    const candle: OccupancyRect = { x: 320, y: 180, w: 30, h: 80 }
    const placed = layoutFillLadder([exit(300, 220)], { ...OPTS, candleRects: [candle] })
    expect(intersects(box(placed[0]), candle)).toBe(false)
    // dot unchanged; pill ended up further right than leaderMin
    expect(placed[0].x).toBe(300)
    expect(placed[0].pillX).toBeGreaterThan(300 + OPTS.leaderMin + OPTS.pillWidth / 2)
  })

  it('routes a pill clear of an avg band at its dot y', () => {
    const bandH = 16
    const band = { y: 220, h: bandH }
    const placed = layoutFillLadder([exit(300, 220)], { ...OPTS, avgBands: [band] })
    const pillTop = placed[0].pillY - OPTS.pillHeight / 2
    const pillBot = placed[0].pillY + OPTS.pillHeight / 2
    const bandTop = band.y - bandH / 2
    const bandBot = band.y + bandH / 2
    expect(pillBot <= bandTop + 1e-9 || pillTop >= bandBot - 1e-9).toBe(true)
    expect(placed[0].y).toBe(220) // dot stays at the true price
  })

  it('flushes to the pane edge when both sides are fully blocked (no crash, no infinite loop)', () => {
    const wall: OccupancyRect = { x: 0, y: 0, w: 600, h: 400 }
    const placed = layoutFillLadder([exit(300, 200)], { ...OPTS, candleRects: [wall] })
    expect(placed[0].pillX).toBe(OPTS.paneWidth - OPTS.pillWidth / 2)
  })

  it('treats already-placed same-side pills as occupancy (no two claim the same gap)', () => {
    const placed = layoutFillLadder([exit(300, 200), exit(300, 205)], OPTS)
    expect(intersects(box(placed[0]), box(placed[1]))).toBe(false)
    expect(Math.abs(placed[0].pillY - placed[1].pillY)).toBeGreaterThanOrEqual(STEP - 1e-9)
  })

  it('keeps the two sides independent — a left and a right pill at the same y do not collide', () => {
    const placed = layoutFillLadder([fp(300, 200), exit(300, 200)], OPTS)
    expect(placed[0].pillX).toBeLessThan(300)
    expect(placed[1].pillX).toBeGreaterThan(300)
    expect(intersects(box(placed[0]), box(placed[1]))).toBe(false)
    expect(placed[0].pillY).toBeCloseTo(200, 6) // no needless vertical push
    expect(placed[1].pillY).toBeCloseTo(200, 6)
  })

  it('does not clamp a pill back onto a candle it routed around near the right pane edge', () => {
    // Exit dot near the right edge; a candle occupies the near-right region so
    // findColumnX must step outward — potentially past paneWidth - halfW.
    // The clamp must NOT pull the pill back on top of that candle.
    const candle: OccupancyRect = { x: 575, y: 180, w: 40, h: 80 }
    const placed = layoutFillLadder([exit(560, 220)], { ...OPTS, candleRects: [candle] })
    // The pill box must remain clear of the candle.
    expect(intersects(box(placed[0]), candle)).toBe(false)
    // natural side (right) is blocked → pill flips LEFT of the dot
    expect(placed[0].pillX).toBeLessThan(placed[0].x)
  })

  it('does not clamp a pill back onto a candle it routed around near the left pane edge', () => {
    // Entry dot near the left edge; a candle occupies the near-left region so
    // findColumnX must step outward (leftward, toward x=0 and past it). The
    // Math.max(halfW, ...) clamp must NOT pull the pill back onto that candle.
    const candle: OccupancyRect = { x: 5, y: 180, w: 40, h: 80 }
    const placed = layoutFillLadder([fp(40, 220)], { ...OPTS, candleRects: [candle] })
    expect(intersects(box(placed[0]), candle)).toBe(false)
    // natural side (left) is blocked → pill flips RIGHT of the dot
    expect(placed[0].pillX).toBeGreaterThan(placed[0].x)
  })

  it('places inward (shorter leader) when outward is blocked but space exists between dot and obstacle', () => {
    // Exit dot at 300; a wide candle blocks the leaderMin outward spot and
    // everything past it on-screen, but the gap [dot..369] admits an INWARD pill
    // (leader < leaderMin) on the natural side — not a flip, not a flush.
    // NOTE: candle x is tuned to the current OPTS (leaderMin 12, pillWidth 58) and
    // LEADER_FLOOR 4 — inward clears at L=8 (cx 337, box right edge 366 < 369).
    // If those constants change, retune this x; the test will go RED to flag it.
    const candle: OccupancyRect = { x: 369, y: 180, w: 240, h: 80 }
    const placed = layoutFillLadder([exit(300, 220)], { ...OPTS, candleRects: [candle] })
    expect(intersects(box(placed[0]), candle)).toBe(false)        // clear of the candle
    expect(placed[0].pillX).toBeGreaterThan(placed[0].x)          // stayed on the natural (right) side
    expect(placed[0].pillX).toBeLessThan(placed[0].x + OPTS.leaderMin + OPTS.pillWidth / 2) // INWARD: closer than leaderMin
  })
})

describe('layoutFillLadder — retained piece-1 de-collision (new signature)', () => {
  it('separates 5 fills on the same bar (spread prices) by >= the min gap (PRFX)', () => {
    const fills = [exit(300, 40), exit(300, 180), exit(300, 185), exit(300, 250), exit(300, 290)]
    const placed = layoutFillLadder(fills, OPTS)
    expect(placed).toHaveLength(5)
    for (let i = 0; i < fills.length; i++) {
      expect(placed[i].x).toBe(300)
      expect(placed[i].y).toBe(fills[i].y) // dots stay on the bar at the exact price
    }
    clusterGapsOk(placed)
  })

  it('separates two fills at the EXACT same (x, y) — coincident dots do not stack (STI)', () => {
    const placed = layoutFillLadder([exit(300, 200, { qty: 3 }), exit(300, 200, { qty: 4 })], OPTS)
    expect(Math.abs(placed[0].pillY - placed[1].pillY)).toBeGreaterThanOrEqual(STEP - 1e-9)
    expect(placed[0].y).toBe(200)
    expect(placed[1].y).toBe(200)
  })

  it('separates a 1-cent near-pair on the same bar', () => {
    const placed = layoutFillLadder([exit(300, 200), exit(300, 203)], OPTS)
    expect(Math.abs(placed[0].pillY - placed[1].pillY)).toBeGreaterThanOrEqual(STEP - 1e-9)
  })

  it('keeps a cluster near the pane bottom within [0, paneHeight] via the push-up clamp', () => {
    const opts: FillLadderOptions = { ...OPTS, paneHeight: 300 }
    const half = opts.pillHeight / 2
    const fills = [exit(300, 250), exit(300, 255), exit(300, 260), exit(300, 265), exit(300, 270)]
    const placed = layoutFillLadder(fills, opts)
    for (const p of placed) {
      expect(p.pillY - half).toBeGreaterThanOrEqual(0 - 1e-9)
      expect(p.pillY + half).toBeLessThanOrEqual(opts.paneHeight + 1e-9)
    }
    clusterGapsOk(placed)
  })

  it('leaves well-separated fills at their dot y (no unnecessary push)', () => {
    const fills = [exit(100, 50), exit(200, 150), exit(300, 250)]
    const placed = layoutFillLadder(fills, OPTS)
    for (let i = 0; i < fills.length; i++) expect(placed[i].pillY).toBeCloseTo(fills[i].y, 9)
  })
})

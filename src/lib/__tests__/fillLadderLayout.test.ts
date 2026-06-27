import { describe, it, expect } from 'vitest'
import {
  layoutFillLadder,
  fillLabelsHoverGated,
  pillIsVisible,
  FILL_LABEL_HOVER_THRESHOLD,
  type FillPoint,
  type FillLadderOptions,
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
function clusterGapsOk(pills: { pillY: number }[]): void {
  const ys = pills.map((p) => p.pillY).sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(STEP - 1e-9)
}

describe('layoutFillLadder — entries-left / exits-right placement (v0.2.4 Part 2)', () => {
  it('splits entries and exits on one bar into two columns (entries left, exits right)', () => {
    const placed = layoutFillLadder([fp(300, 200), exit(300, 205), fp(300, 210)], OPTS)
    expect(placed[0].pillX).toBeCloseTo(300 - 74, 6) // entry → left of meanX (offset 29+45)
    expect(placed[2].pillX).toBeCloseTo(300 - 74, 6) // entry → left of meanX
    expect(placed[1].pillX).toBeCloseTo(300 + 74, 6) // exit → right of meanX
    clusterGapsOk([placed[0], placed[2]])            // the two entries fan apart in their own column
    expect(placed[0].x).toBe(300); expect(placed[0].y).toBe(200)
  })
  it('merges two nearby bars (gap <= MERGE_PX) into one cluster, role-split into two columns at meanX ± offset', () => {
    const placed = layoutFillLadder([exit(300, 200), exit(350, 220)], OPTS)
    expect(placed[0].pillX).toBe(placed[1].pillX)    // both exits → same column
    expect(placed[0].pillX).toBeCloseTo(325 + 74, 6) // exits → right of meanX (325 + offset)
  })
  it('keeps distant bars (gap > MERGE_PX) as separate columns', () => {
    const placed = layoutFillLadder([exit(300, 200), exit(400, 200)], OPTS)
    expect(placed[0].pillX).not.toBe(placed[1].pillX)
    expect(placed[0].pillX).toBeCloseTo(374, 6)      // exit at bar 300 → 300 + 74
    expect(placed[1].pillX).toBeCloseTo(474, 6)      // exit at bar 400 → 400 + 74
  })
  it('clamps the column anchor within the pane near an edge', () => {
    const exitPlaced = layoutFillLadder([exit(5, 200)], OPTS)
    expect(exitPlaced[0].pillX).toBe(79)                  // exit → right: 5 + 74, inside pane (no clamp)
    const entryPlaced = layoutFillLadder([fp(5, 200)], OPTS)
    expect(entryPlaced[0].pillX).toBe(OPTS.pillWidth / 2) // entry → left: 5 - 74 = -69, left-clamped to 29
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

// v0.2.4 fill-label hover gating (high-fill readability — djsevans87 / Dave):
// dots stay always-on; pills go always-on (low-fill) vs hover-only (high-fill).
describe('fillLabelsHoverGated — fill-count threshold', () => {
  it('low-fill (fewer than the threshold) keeps pills always-on (not gated)', () => {
    expect(fillLabelsHoverGated(0)).toBe(false)
    expect(fillLabelsHoverGated(6)).toBe(false)
  })
  it('high-fill (at or above the threshold) gates pills behind hover', () => {
    expect(fillLabelsHoverGated(7)).toBe(true)
    expect(fillLabelsHoverGated(20)).toBe(true)
  })
  it('the threshold is 7 (one named source of truth)', () => {
    expect(FILL_LABEL_HOVER_THRESHOLD).toBe(7)
    expect(fillLabelsHoverGated(FILL_LABEL_HOVER_THRESHOLD)).toBe(true)
    expect(fillLabelsHoverGated(FILL_LABEL_HOVER_THRESHOLD - 1)).toBe(false)
  })
})

describe('pillIsVisible — per-pill hover gating', () => {
  it('not gated (low-fill): every pill is always visible, hovered bar irrelevant', () => {
    expect(pillIsVisible(false, 300, null)).toBe(true)
    expect(pillIsVisible(false, 300, 999)).toBe(true)
  })
  it('gated (high-fill): a pill shows only when its bar matches the hovered bar', () => {
    expect(pillIsVisible(true, 300, 300)).toBe(true)
    expect(pillIsVisible(true, 300, 360)).toBe(false)
  })
  it('gated (high-fill): no pill shows when the cursor is off the bars (null)', () => {
    expect(pillIsVisible(true, 300, null)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  layoutFillLadder,
  type FillPoint,
  type FillLadderOptions,
} from '../fillLadderLayout'

// pillHeight + minGap = the minimum center-to-center distance for two pills in
// the same x-cluster (so the gap between their edges is >= minGap).
const OPTS: FillLadderOptions = { paneHeight: 400, pillHeight: 18, minGap: 4, pillOffsetX: 12 }
const STEP = OPTS.pillHeight + OPTS.minGap // 22

function fp(x: number, y: number, over: Partial<FillPoint> = {}): FillPoint {
  return { x, y, qty: 100, price: 1, kind: 'entry', side: 'B', ...over }
}

// Sorted pillY of a same-x cluster; consecutive pairs must be >= STEP apart.
function clusterGapsOk(pills: { pillY: number }[]): void {
  const ys = pills.map((p) => p.pillY).sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++) {
    expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(STEP - 1e-9)
  }
}

describe('layoutFillLadder', () => {
  it('separates 5 fills on the same bar (spread prices) by at least the min gap (PRFX)', () => {
    // PRFX id=29: 5 fills, same 1m bar (same x), prices 5.11/5.01/5.00/4.93/4.90.
    // Higher price = smaller y; 180/185 is the 5.00/5.01 near-pair.
    const fills = [fp(100, 40), fp(100, 180), fp(100, 185), fp(100, 250), fp(100, 290)]
    const placed = layoutFillLadder(fills, OPTS)
    expect(placed).toHaveLength(5)
    // dots stay on the bar at the exact price; pill offset to the right
    for (let i = 0; i < fills.length; i++) {
      expect(placed[i].x).toBe(fills[i].x)
      expect(placed[i].y).toBe(fills[i].y)
      expect(placed[i].pillX).toBe(fills[i].x + OPTS.pillOffsetX)
    }
    clusterGapsOk(placed)
  })

  it('separates two fills at the EXACT same (x, y) — coincident dots do not stack (STI)', () => {
    // STI id=66: 3@15.72 and 4@15.72 → identical x AND y.
    const fills = [
      fp(100, 200, { qty: 3, side: 'S', kind: 'exit' }),
      fp(100, 200, { qty: 4, side: 'S', kind: 'exit' }),
    ]
    const placed = layoutFillLadder(fills, OPTS)
    expect(Math.abs(placed[0].pillY - placed[1].pillY)).toBeGreaterThanOrEqual(STEP - 1e-9)
    // the dots themselves stay at the true price
    expect(placed[0].y).toBe(200)
    expect(placed[1].y).toBe(200)
  })

  it('separates a 1-cent near-pair on the same bar', () => {
    const fills = [fp(100, 200), fp(100, 203)] // ~1¢ apart, far closer than a pill
    const placed = layoutFillLadder(fills, OPTS)
    expect(Math.abs(placed[0].pillY - placed[1].pillY)).toBeGreaterThanOrEqual(STEP - 1e-9)
  })

  it('keeps a cluster near the pane bottom within [0, paneHeight] via the push-up clamp', () => {
    const opts: FillLadderOptions = { ...OPTS, paneHeight: 300 }
    const half = opts.pillHeight / 2
    const fills = [fp(100, 250), fp(100, 255), fp(100, 260), fp(100, 265), fp(100, 270)]
    const placed = layoutFillLadder(fills, opts)
    for (const p of placed) {
      expect(p.pillY - half).toBeGreaterThanOrEqual(0 - 1e-9)
      expect(p.pillY + half).toBeLessThanOrEqual(opts.paneHeight + 1e-9)
    }
    clusterGapsOk(placed)
  })

  it('leaves well-separated fills at their dot y (no unnecessary push)', () => {
    // 3 singletons on different bars + one same-x pair spaced far apart in y.
    const fills = [fp(100, 50), fp(200, 150), fp(300, 250), fp(400, 100), fp(400, 200)]
    const placed = layoutFillLadder(fills, OPTS)
    for (let i = 0; i < fills.length; i++) {
      expect(placed[i].pillY).toBeCloseTo(fills[i].y, 9)
    }
  })
})

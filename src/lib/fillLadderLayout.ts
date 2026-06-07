// Pure de-collision + central-stack layout for the ladder fill markers. NO chart
// / React / lightweight-charts imports — just geometry, so it stays portable and
// unit-tested. The chart-coupled primitive (fillLadderPrimitive) feeds it the
// fills + pane bounds as plain data; this returns where to draw each pill.
//
// PART 2 — CENTRAL VERTICAL STACK: a bar's fills — entries AND exits together —
// merge into ONE column centered on the cluster's mean bar-x (nearby bars within
// MERGE_PX merge into the same column), fanned vertically at step = pillHeight +
// minGap so no two pills overlap. The dot stays on its exact (x, y); only the
// pill moves to the column. No left/right role-split, no horizontal free-space
// search — the pills sit over the candles by design.

export interface OccupancyRect {
  x: number
  y: number
  w: number
  h: number
}

export interface FillPoint {
  /** Dot x in CSS px (from timeToCoordinate). Same-bar fills share an IDENTICAL x. */
  x: number
  /** Dot y in CSS px (from priceToCoordinate) — the dot sits here, at the exact price. */
  y: number
  qty: number
  price: number
  kind: 'entry' | 'exit'
  side: 'B' | 'S'
}

export interface PlacedPill {
  /** Dot position — unchanged (the dot always marks the true fill price). */
  x: number
  y: number
  /** Pill center — the cluster's anchor x (mean bar-x, pane-clamped); pillY swept clear. */
  pillX: number
  pillY: number
  qty: number
  price: number
  kind: 'entry' | 'exit'
  side: 'B' | 'S'
}

export interface FillLadderOptions {
  paneWidth: number
  paneHeight: number
  pillWidth: number
  pillHeight: number
  /** Minimum vertical gap between two stacked pills' edges, CSS px. */
  minGap: number
  /** Shortest leader — pill sits this far from the dot when the spot there is free. */
  leaderMin: number
  /** Longest leader we route before giving up and placing at leaderMax anyway. */
  leaderMax: number
  /** Candle pixel boxes to avoid (occupied space). */
  candleRects: OccupancyRect[]
  /** Full-width horizontal occupied bands (avg lines), centered at y, thickness h. */
  avgBands: { y: number; h: number }[]
}

// Vertical de-collision for one side's same-x column. `ideal` = the dots' y
// (input order). Sweep DOWN keeping `step` apart and pushing below any avg band;
// on bottom overflow re-anchor at the floor and sweep UP; top-clamp if taller
// than the pane. With no bands this is exactly the piece-1 sweep.
function placeColumn(
  ideal: number[],
  paneHeight: number,
  pillHeight: number,
  minGap: number,
  bands: { y: number; h: number }[],
): number[] {
  const n = ideal.length
  const half = pillHeight / 2
  const step = pillHeight + minGap
  const order = ideal.map((_, i) => i).sort((a, b) => ideal[a] - ideal[b]) // top → bottom
  const out = new Array<number>(n)

  let prev = -Infinity
  for (const i of order) {
    let c = Math.max(ideal[i], prev + step)
    // Push the pill below any avg band it overlaps (full-width bands can only be
    // cleared in Y); re-respect the previous pill afterwards. Loop terminates —
    // c only ever increases, bands are finite.
    let moved = true
    while (moved) {
      moved = false
      for (const b of bands) {
        const bt = b.y - b.h / 2
        const bb = b.y + b.h / 2
        if (c - half < bb && c + half > bt) {
          c = bb + half
          moved = true
        }
      }
      if (c < prev + step) {
        c = prev + step
        moved = true
      }
    }
    out[i] = c
    prev = c
  }

  const bottomIdx = order[n - 1]
  if (out[bottomIdx] + half > paneHeight) {
    let next = Infinity
    for (let k = n - 1; k >= 0; k--) {
      const i = order[k]
      const cap = k === n - 1 ? paneHeight - half : next - step
      const yc = Math.min(ideal[i], cap)
      out[i] = yc
      next = yc
    }
  }

  const topIdx = order[0]
  if (out[topIdx] - half < 0) {
    const shift = half - out[topIdx]
    for (let i = 0; i < n; i++) out[i] += shift
  }

  return out
}

/**
 * Place "QTY @ PRICE" pills as ONE central vertical stack per cluster. A bar's
 * fills — entries AND exits together — merge into a single column, fanned at
 * step = pillHeight + minGap by placeColumn, centered on the cluster's mean bar-x
 * (nearby bars within MERGE_PX merge). Dots stay on their exact (x, y); only the
 * pill moves to the column. No left/right role-split, no horizontal search.
 */
export function layoutFillLadder(fills: FillPoint[], opts: FillLadderOptions): PlacedPill[] {
  const { paneWidth, paneHeight, pillWidth, pillHeight, minGap } = opts
  const halfW = pillWidth / 2
  const placed = new Array<PlacedPill>(fills.length)
  if (fills.length === 0) return placed
  const mergePx = pillWidth
  const byBar = new Map<number, number[]>()
  for (let i = 0; i < fills.length; i++) {
    const k = Math.round(fills[i].x)
    const arr = byBar.get(k)
    if (arr) arr.push(i)
    else byBar.set(k, [i])
  }
  const clusters: number[][] = []
  for (const bx of [...byBar.keys()].sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1]
    if (last && bx - last[last.length - 1] <= mergePx) last.push(bx)
    else clusters.push([bx])
  }
  for (const cluster of clusters) {
    const idx: number[] = []
    for (const bx of cluster) idx.push(...byBar.get(bx)!)
    const meanX = cluster.reduce((s, x) => s + x, 0) / cluster.length
    const anchorX = Math.max(halfW, Math.min(paneWidth - halfW, meanX))
    const pillYs = placeColumn(idx.map((i) => fills[i].y), paneHeight, pillHeight, minGap, [])
    idx.forEach((i, k) => {
      const f = fills[i]
      placed[i] = { x: f.x, y: f.y, pillX: anchorX, pillY: pillYs[k], qty: f.qty, price: f.price, kind: f.kind, side: f.side }
    })
  }
  return placed
}

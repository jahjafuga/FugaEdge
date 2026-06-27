// Pure de-collision + per-role placement layout for the ladder fill markers. NO chart
// / React / lightweight-charts imports — just geometry, so it stays portable and
// unit-tested. The chart-coupled primitive (fillLadderPrimitive) feeds it the
// fills + pane bounds as plain data; this returns where to draw each pill.
//
// PART 2 — PER-ROLE PLACEMENT: within each bar cluster, fills split by role — entry
// pills offset LEFT of the cluster's mean bar-x, exit pills offset RIGHT — by a fixed
// horizontal gap (LEADER_GAP), producing a ~60px center offset to match the PRFX SVG
// target. Each side fans vertically via placeColumn (step = pillHeight + minGap) so no
// two pills overlap. The dot stays on its exact (x, y); only the pill moves.

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
  /** Pill center — the role-based column anchor — entries: meanX - offset (pane-clamped); exits: meanX + offset (pane-clamped); offset = pillWidth/2 + LEADER_GAP. */
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

const LEADER_GAP = 45  // px between dot and pill near-edge; ~77px center offset to give the leader visible room across clear background

/**
 * Place "QTY @ PRICE" pills per role. Within each bar cluster, fills split by kind
 * into two columns: entryAnchorX = clamp(meanX - (pillWidth/2 + LEADER_GAP)),
 * exitAnchorX = clamp(meanX + (pillWidth/2 + LEADER_GAP)). placeColumn is called
 * independently per side (the vertical fan). Single-role clusters get one column.
 * Dots stay on their exact (x, y); only the pill moves to its column.
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
    const offset = halfW + LEADER_GAP
    const entryIdx = idx.filter((i) => fills[i].kind === 'entry')
    const exitIdx = idx.filter((i) => fills[i].kind === 'exit')
    if (entryIdx.length > 0) {
      const entryAnchorX = Math.max(halfW, Math.min(paneWidth - halfW, meanX - offset))
      const entryYs = placeColumn(entryIdx.map((i) => fills[i].y), paneHeight, pillHeight, minGap, [])
      entryIdx.forEach((i, k) => {
        const f = fills[i]
        placed[i] = { x: f.x, y: f.y, pillX: entryAnchorX, pillY: entryYs[k], qty: f.qty, price: f.price, kind: f.kind, side: f.side }
      })
    }
    if (exitIdx.length > 0) {
      const exitAnchorX = Math.max(halfW, Math.min(paneWidth - halfW, meanX + offset))
      const exitYs = placeColumn(exitIdx.map((i) => fills[i].y), paneHeight, pillHeight, minGap, [])
      exitIdx.forEach((i, k) => {
        const f = fills[i]
        placed[i] = { x: f.x, y: f.y, pillX: exitAnchorX, pillY: exitYs[k], qty: f.qty, price: f.price, kind: f.kind, side: f.side }
      })
    }
  }
  return placed
}

// v0.2.4 fill-label hover gating (high-fill readability, approved community
// request — djsevans87 / Dave: 20-fill trades like VSME cram pills over the
// candles). DOTS stay always-on; only the PILLS gate. Low-fill trades keep the
// always-on pills they have today; high-fill trades hide pills until the trader
// hovers a bar, then show only that bar's pills. Pure policy so it unit-tests
// without the chart; the canvas primitive + ChartTab consume it.

/** Total rendered-fill count at/above which fill-label PILLS switch from
 *  always-on to hover-gated. One source of truth for the threshold. */
export const FILL_LABEL_HOVER_THRESHOLD = 7

/** True when a trade with `fillCount` rendered fills hides its pills until hover
 *  (>= the threshold). Below it, pills stay always-on (today's behavior). */
export function fillLabelsHoverGated(fillCount: number): boolean {
  return fillCount >= FILL_LABEL_HOVER_THRESHOLD
}

/** Whether one pill paints this frame. Not gated (low-fill) -> always visible.
 *  Gated (high-fill) -> only the pill whose snapped bar matches the hovered bar,
 *  and nothing when the cursor is off the bars (hoveredBarTime null). Both times
 *  are in the chart's epoch-seconds space; the caller normalizes before comparing. */
export function pillIsVisible(
  hoverGated: boolean,
  pillTimeSec: number,
  hoveredBarTimeSec: number | null,
): boolean {
  if (!hoverGated) return true
  return hoveredBarTimeSec !== null && pillTimeSec === hoveredBarTimeSec
}

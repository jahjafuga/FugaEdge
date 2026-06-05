// Pure de-collision + free-space layout for the ladder fill markers. NO chart /
// React / lightweight-charts imports — just geometry, so it stays portable and
// unit-tested. The chart-coupled primitive (fillLadderPrimitive) assembles the
// occupancy (candle rects, avg bands, pane bounds) from the live chart and feeds
// it here as plain data; this returns where to draw each pill.
//
// PIECE 2: entries route their pill LEFT of the dot, exits route RIGHT; each
// pill's leader reaches to the nearest free spot on its side (avoiding candles +
// already-placed pills), and same-side/same-bar pills de-collide vertically
// (avoiding avg bands), clamped in-band.

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
  /** Pill center. LEFT of x for entries, RIGHT for exits; pillY swept clear. */
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

const SEARCH_STEP = 4 // px increment for the horizontal free-space search

function rectsIntersect(a: OccupancyRect, b: OccupancyRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function overlapsAny(box: OccupancyRect, rects: OccupancyRect[]): boolean {
  for (const r of rects) if (rectsIntersect(box, r)) return true
  return false
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

// Horizontal free-space search for a column: step outward from the dot (left for
// entries, right for exits), starting at leaderMin, until a pill box spanning the
// column's vertical extent clears the candles + already-placed pills. Returns the
// pill CENTER x; falls back to leaderMax if nothing's free (accept the overlap
// rather than an infinite leader).
function findColumnX(
  dir: -1 | 1,
  dotX: number,
  yTop: number,
  yBot: number,
  pillWidth: number,
  candleRects: OccupancyRect[],
  placedBoxes: OccupancyRect[],
  leaderMin: number,
  leaderMax: number,
): number {
  const halfW = pillWidth / 2
  for (let L = leaderMin; L <= leaderMax; L += SEARCH_STEP) {
    const cx = dir > 0 ? dotX + L + halfW : dotX - L - halfW
    const probe: OccupancyRect = { x: cx - halfW, y: yTop, w: pillWidth, h: yBot - yTop }
    if (!overlapsAny(probe, candleRects) && !overlapsAny(probe, placedBoxes)) return cx
  }
  return dir > 0 ? dotX + leaderMax + halfW : dotX - leaderMax - halfW
}

/**
 * Place "QTY @ PRICE" pills with role split + free-space routing. Dots stay on
 * their exact (x, y). Entry pills go LEFT, exit pills RIGHT, each reaching the
 * nearest spot clear of candles + placed pills, then de-colliding vertically
 * (clear of avg bands) within each side's bar-cluster, clamped in-band.
 */
export function layoutFillLadder(fills: FillPoint[], opts: FillLadderOptions): PlacedPill[] {
  const { paneWidth, paneHeight, pillWidth, pillHeight, minGap, leaderMin, leaderMax, candleRects, avgBands } = opts
  const half = pillHeight / 2
  const halfW = pillWidth / 2
  const placed = new Array<PlacedPill>(fills.length)

  // Each role is an independent column system on its own side — opposite sides
  // never collide, so their occupancy is tracked separately.
  for (const kind of ['entry', 'exit'] as const) {
    const dir: -1 | 1 = kind === 'entry' ? -1 : 1
    const indices = fills.map((_, i) => i).filter((i) => fills[i].kind === kind)

    // Group by bar (same-bar fills share an identical x → round groups exactly).
    const clusters = new Map<number, number[]>()
    for (const i of indices) {
      const k = Math.round(fills[i].x)
      const arr = clusters.get(k)
      if (arr) arr.push(i)
      else clusters.set(k, [i])
    }

    const placedBoxes: OccupancyRect[] = [] // this side's placed pills (occupancy)
    for (const ck of [...clusters.keys()].sort((a, b) => a - b)) {
      const idx = clusters.get(ck)!
      const dotX = fills[idx[0]].x

      // Vertical de-collision first → the column's final pillY span.
      const pillYs = placeColumn(idx.map((i) => fills[i].y), paneHeight, pillHeight, minGap, avgBands)
      const yTop = Math.min(...pillYs) - half
      const yBot = Math.max(...pillYs) + half

      // Horizontal leader: nearest free spot clearing candles + earlier pills.
      let cx = findColumnX(dir, dotX, yTop, yBot, pillWidth, candleRects, placedBoxes, leaderMin, leaderMax)
      // Keep the pill on-screen.
      cx = Math.max(halfW, Math.min(paneWidth - halfW, cx))

      idx.forEach((i, j) => {
        const f = fills[i]
        placed[i] = { x: f.x, y: f.y, pillX: cx, pillY: pillYs[j], qty: f.qty, price: f.price, kind: f.kind, side: f.side }
        placedBoxes.push({ x: cx - halfW, y: pillYs[j] - half, w: pillWidth, h: pillHeight })
      })
    }
  }

  return placed
}

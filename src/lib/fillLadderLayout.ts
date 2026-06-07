// Pure de-collision + free-space layout for the ladder fill markers. NO chart /
// React / lightweight-charts imports — just geometry, so it stays portable and
// unit-tested. The chart-coupled primitive (fillLadderPrimitive) assembles the
// occupancy (candle rects, avg bands, pane bounds) from the live chart and feeds
// it here as plain data; this returns where to draw each pill.
//
// PIECE 2: entries route their pill LEFT of the dot, exits route RIGHT; each
// pill's leader reaches to the nearest free spot on its side (avoiding only
// already-placed pills — pills sit OVER the candles), and same-side/same-bar
// pills de-collide vertically (avoiding avg bands), clamped in-band.

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
const LEADER_FLOOR = 4 // px: shortest inward leader, keeps the pill's near edge off the dot

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

// Horizontal pill placement: search the natural side OUTWARD (leaderMin→leaderMax)
// then INWARD (→LEADER_FLOOR); if that side is fully blocked, FLIP to the opposite
// side; if both are blocked, flush to the natural-side edge. (searchSide does one
// side; findColumnX orchestrates.)
function searchSide(
  dir: -1 | 1,
  dotX: number,
  yTop: number,
  yBot: number,
  pillWidth: number,
  paneWidth: number,
  _candleRects: OccupancyRect[],
  placedBoxes: OccupancyRect[],
  leaderMin: number,
  leaderMax: number,
): number | null {
  const halfW = pillWidth / 2
  const tryAt = (L: number): number | null => {
    const cx = dir > 0 ? dotX + L + halfW : dotX - L - halfW
    const probe: OccupancyRect = { x: cx - halfW, y: yTop, w: pillWidth, h: yBot - yTop }
    // De-collide against other PILLS only — NOT candles. A pill is the annotation
    // ON TOP of the price action, so it hugs its dot at the shortest leader rather
    // than fleeing to candle-free whitespace. (The candle rects are still threaded
    // in — param kept as `_candleRects` — for a possible Part 2; not consulted here.)
    if (
      cx - halfW >= 0 &&
      cx + halfW <= paneWidth &&
      !overlapsAny(probe, placedBoxes)
    )
      return cx
    return null
  }
  // Outward.
  for (let L = leaderMin; L <= leaderMax; L += SEARCH_STEP) {
    const hit = tryAt(L)
    if (hit !== null) return hit
  }
  // Inward (longer inward leaders first, down to the floor).
  for (let L = leaderMin - SEARCH_STEP; L >= LEADER_FLOOR; L -= SEARCH_STEP) {
    const hit = tryAt(L)
    if (hit !== null) return hit
  }
  return null
}

// Place the pill in three tiers: (1) PREFERRED — natural side (outward then
// inward) then FLIP, within [leaderMin, leaderMax] (the hug range); (2) OVERFLOW
// — if both are full, search OUT TO THE PANE EDGE for the nearest free x (natural
// then flip), so a crowded column lands clear of other pills instead of on top of
// one (far is acceptable here, hidden is not); (3) LAST RESORT — no free x
// anywhere at this column's y, flush to the natural-side edge.
function findColumnX(
  dir: -1 | 1,
  dotX: number,
  yTop: number,
  yBot: number,
  pillWidth: number,
  paneWidth: number,
  candleRects: OccupancyRect[],
  placedBoxes: OccupancyRect[],
  leaderMin: number,
  leaderMax: number,
): number {
  const halfW = pillWidth / 2
  const flip = (-dir) as -1 | 1
  // Tier 1 — preferred (the hug range).
  const natural = searchSide(dir, dotX, yTop, yBot, pillWidth, paneWidth, candleRects, placedBoxes, leaderMin, leaderMax)
  if (natural !== null) return natural
  const flipped = searchSide(flip, dotX, yTop, yBot, pillWidth, paneWidth, candleRects, placedBoxes, leaderMin, leaderMax)
  if (flipped !== null) return flipped
  // Tier 2 — overflow to the pane edge (nearest free x; never overlaps a pill).
  const naturalFar = searchSide(dir, dotX, yTop, yBot, pillWidth, paneWidth, candleRects, placedBoxes, leaderMin, paneWidth)
  if (naturalFar !== null) return naturalFar
  const flippedFar = searchSide(flip, dotX, yTop, yBot, pillWidth, paneWidth, candleRects, placedBoxes, leaderMin, paneWidth)
  if (flippedFar !== null) return flippedFar
  // Tier 3 — last resort.
  return dir > 0 ? paneWidth - halfW : halfW
}

/**
 * Place "QTY @ PRICE" pills with role split + free-space routing. Dots stay on
 * their exact (x, y). Entry pills go LEFT, exit pills RIGHT, each reaching the
 * nearest spot clear of placed pills (sitting over the candles), then de-colliding
 * vertically (clear of avg bands) within each side's bar-cluster, clamped in-band.
 */
export function layoutFillLadder(fills: FillPoint[], opts: FillLadderOptions): PlacedPill[] {
  const { paneWidth, paneHeight, pillWidth, pillHeight, minGap, leaderMin, leaderMax, candleRects, avgBands } = opts
  const half = pillHeight / 2
  const halfW = pillWidth / 2
  const placed = new Array<PlacedPill>(fills.length)

  // ONE shared occupancy list across BOTH roles (not per-role): entries are
  // placed first, then exits, so the later role always sees and avoids the
  // earlier role's pills. This guarantees a flipped/overflowed pill can't land on
  // the other role's pill (the cross-role hidden-pill defect).
  const placedBoxes: OccupancyRect[] = []
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

    for (const ck of [...clusters.keys()].sort((a, b) => a - b)) {
      const idx = clusters.get(ck)!
      const dotX = fills[idx[0]].x

      // Vertical de-collision first → the column's final pillY span.
      const pillYs = placeColumn(idx.map((i) => fills[i].y), paneHeight, pillHeight, minGap, avgBands)
      const yTop = Math.min(...pillYs) - half
      const yBot = Math.max(...pillYs) + half

      // Horizontal leader: nearest free spot clearing candles + earlier pills.
      const cx = findColumnX(dir, dotX, yTop, yBot, pillWidth, paneWidth, candleRects, placedBoxes, leaderMin, leaderMax)

      idx.forEach((i, j) => {
        const f = fills[i]
        placed[i] = { x: f.x, y: f.y, pillX: cx, pillY: pillYs[j], qty: f.qty, price: f.price, kind: f.kind, side: f.side }
        placedBoxes.push({ x: cx - halfW, y: pillYs[j] - half, w: pillWidth, h: pillHeight })
      })
    }
  }

  return placed
}

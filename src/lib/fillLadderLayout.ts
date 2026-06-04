// Pure de-collision layout for the ladder fill markers (PIECE 1). NO chart /
// React / lightweight-charts imports — just geometry, so it stays portable and
// unit-tested (the safety net for the fan/stack before pixels). The chart-coupled
// primitive (fillLadderPrimitive) feeds it pixel coords and draws the result.

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
  /** Pill center, de-collided. pillX = x + pillOffsetX; pillY swept clear of neighbours. */
  pillX: number
  pillY: number
  qty: number
  price: number
  kind: 'entry' | 'exit'
  side: 'B' | 'S'
}

export interface FillLadderOptions {
  /** Visible pane height in CSS px — pills are kept within [0, paneHeight]. */
  paneHeight: number
  /** Pill box height in CSS px. */
  pillHeight: number
  /** Minimum vertical gap between two stacked pills' edges, CSS px. */
  minGap: number
  /** Horizontal offset of the pill center from its dot, CSS px (pill to the right). */
  pillOffsetX: number
}

// De-collide one x-cluster's pill centers. `ideal` = the dots' y (input order);
// returns the placed centers (input order). Anchor at ideal, sweep DOWN to keep
// spacing; if that overflows the floor, re-anchor at the floor and sweep UP;
// finally a top clamp for a cluster taller than the pane. Keying on pixel y means
// coincident dots (0¢, identical y) separate just like near ones.
function placeCluster(ideal: number[], paneHeight: number, pillHeight: number, minGap: number): number[] {
  const n = ideal.length
  const half = pillHeight / 2
  const step = pillHeight + minGap // minimum center-to-center
  const order = ideal.map((_, i) => i).sort((a, b) => ideal[a] - ideal[b]) // top → bottom
  const out = new Array<number>(n)

  // DOWN-sweep: each pill at max(ideal, prevCenter + step).
  let prev = -Infinity
  for (const i of order) {
    const yc = Math.max(ideal[i], prev + step)
    out[i] = yc
    prev = yc
  }

  // BOTTOM overflow → re-anchor from the floor and sweep UP (push the crowded
  // stack up instead of off the bottom edge).
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

  // TOP clamp: a cluster taller than the pane → shift the whole stack down the
  // minimal amount so the top pill is fully visible (uniform shift keeps gaps).
  const topIdx = order[0]
  if (out[topIdx] - half < 0) {
    const shift = half - out[topIdx]
    for (let i = 0; i < n; i++) out[i] += shift
  }

  return out
}

/**
 * Place "QTY @ PRICE" pills next to their fill dots, de-collided vertically.
 * Dots stay on their exact (x, y); pills offset right and sweep clear of each
 * other within an x-cluster, staying inside the pane.
 */
export function layoutFillLadder(fills: FillPoint[], opts: FillLadderOptions): PlacedPill[] {
  const { paneHeight, pillHeight, minGap, pillOffsetX } = opts

  // Group into x-clusters. Same-bar fills snap to the same bar time → IDENTICAL
  // x, so rounding to the nearest px groups a bar's fills exactly (and folds in
  // any sub-pixel-adjacent bars, which would visually overlap anyway).
  const byCluster = new Map<number, number[]>() // rounded-x → fill indices
  fills.forEach((f, i) => {
    const k = Math.round(f.x)
    const arr = byCluster.get(k)
    if (arr) arr.push(i)
    else byCluster.set(k, [i])
  })

  const placed = new Array<PlacedPill>(fills.length)
  for (const indices of byCluster.values()) {
    const ideal = indices.map((i) => fills[i].y)
    const centers = placeCluster(ideal, paneHeight, pillHeight, minGap)
    indices.forEach((i, j) => {
      const f = fills[i]
      placed[i] = {
        x: f.x,
        y: f.y,
        pillX: f.x + pillOffsetX,
        pillY: centers[j],
        qty: f.qty,
        price: f.price,
        kind: f.kind,
        side: f.side,
      }
    })
  }
  return placed
}

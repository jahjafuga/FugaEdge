// v0.2.7 — WHERE EDGE LIVES. The carried position of the assistant's disc.
//
// THE IDIOM IS columns.ts', deliberately: one global localStorage key, a
// storage() helper that tolerates no-window, a defensive read that falls back
// to the default rather than throwing. Chosen over the versioned filter idiom
// because a position is a DEVICE-LAYOUT preference like column visibility —
// account-independent, a flat pair of numbers, with no absent-versus-empty
// semantics for a version stamp to protect. The read-side defense here is the
// CLAMP, not a version: a stored position outside the live viewport is pulled
// back inside, and a corrupt blob restores the default corner. A lost
// position is impossible by construction.

export const EDGE_POSITION_KEY = 'fuga.edge.position'

/** Which horizontal edge a position was dropped against.
 *
 *  THERE IS NO THIRD VALUE AND NO VERTICAL TWIN. QueryBubble.tsx:538 forces x
 *  to one of exactly two pixels on every release, so a horizontal drop in open
 *  space has never been possible; y is clamped and never snapped, so a
 *  vertical anchor would describe something the drag cannot produce. */
export type EdgeAnchorX = 'left' | 'right'

export interface EdgePosition {
  x: number
  y: number
  /** The edge this position means, when it means an edge.
   *
   *  ABSENT IS A COORDINATE, NOT A FAULT. Every blob written before this
   *  field existed is a bare pair of numbers and must keep rendering where it
   *  says, so the field is optional and its absence is the legacy reading.
   *
   *  x IS STILL WRITTEN AND STILL MEANS SOMETHING. An anchored blob carries
   *  the pixel the anchor resolved to at the width it was dropped at, so a
   *  build that predates this field reads the pair and puts the disc in a
   *  sensible place instead of falling back to the corner. */
  anchorX?: EdgeAnchorX
}

function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

/** The stored position, or null for the default corner. Corrupt, partial or
 *  non-numeric blobs all read as null — never a throw, never NaN.
 *
 *  AN INVALID ANCHOR NULLS THE WHOLE BLOB, on the precedent five lines below:
 *  an x that is not a finite number does not become a default x, it discards
 *  the position entirely. A blob claiming an anchor this build does not know
 *  was not written by this build, and the file's stance on those is stated in
 *  its own header — the read-side defense is total, and a lost position is
 *  impossible only because the corner is always there to fall back to.
 *  THE COST IS NAMED: were a third anchor value ever added, THIS build would
 *  read those blobs as the corner rather than as a coordinate. That is the
 *  conservative half of the trade and it is the half the file already takes
 *  everywhere else. */
export function readEdgePosition(): EdgePosition | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(EDGE_POSITION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { x, y, anchorX } = parsed as { x?: unknown; y?: unknown; anchorX?: unknown }
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    if (typeof y !== 'number' || !Number.isFinite(y)) return null
    // THE LEGACY PATH, and it returns before the anchor is ever judged.
    if (anchorX === undefined) return { x, y }
    if (anchorX !== 'left' && anchorX !== 'right') return null
    return { x, y, anchorX }
  } catch {
    return null
  }
}

export function writeEdgePosition(pos: EdgePosition): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(EDGE_POSITION_KEY, JSON.stringify(pos))
  } catch {
    /* a full store is not worth an error for a preference */
  }
}

/** Pull a position fully inside the viewport, honouring the house margin.
 *  Applied on RESTORE and on every drag frame, so neither a stale blob from
 *  a larger monitor nor an enthusiastic drag can strand the disc. */
export function clampEdgePosition(
  pos: EdgePosition,
  viewportW: number,
  viewportH: number,
  discPx: number,
  marginPx: number,
): EdgePosition {
  const maxX = Math.max(marginPx, viewportW - marginPx - discPx)
  const maxY = Math.max(marginPx, viewportH - marginPx - discPx)
  return {
    x: Math.min(Math.max(pos.x, marginPx), maxX),
    y: Math.min(Math.max(pos.y, marginPx), maxY),
  }
}

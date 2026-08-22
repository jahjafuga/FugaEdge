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

export interface EdgePosition {
  x: number
  y: number
}

function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

/** The stored position, or null for the default corner. Corrupt, partial or
 *  non-numeric blobs all read as null — never a throw, never NaN. */
export function readEdgePosition(): EdgePosition | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(EDGE_POSITION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { x, y } = parsed as { x?: unknown; y?: unknown }
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    if (typeof y !== 'number' || !Number.isFinite(y)) return null
    return { x, y }
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

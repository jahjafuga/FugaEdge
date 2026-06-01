/**
 * passthroughVirtualizer — a test-only stand-in for @tanstack/react-virtual's
 * `useVirtualizer`, shared by the jsdom (.test.tsx) lane.
 *
 * WHY: under jsdom the scroll element's `clientHeight` is 0 (no layout engine,
 * and setup-jsdom.ts installs no ResizeObserver), so the real virtualizer
 * computes an empty visible range and renders ZERO body rows. Every virtualized
 * table therefore mounts with no rows, and row-level queries (checkboxes,
 * cells) find nothing.
 *
 * WHAT: this returns one VirtualItem per row so every row is "visible". It
 * touches ONLY the public surface the components read — `getVirtualItems()` and
 * `getTotalSize()`, plus the documented VirtualItem fields (index / start /
 * end / size / key). It does NOT reimplement observers, measurement, scrolling,
 * or any Virtualizer internals.
 *
 * HOW (to keep it non-fragile): if a component starts reading another part of
 * the virtualizer API, ADD it here using the library's PUBLIC contract — do not
 * reach into internals or simulate effect/observer behaviour. A small honest
 * passthrough beats a clever brittle one.
 *
 * Usage (the factory must import lazily so vi.mock hoisting stays happy):
 *   vi.mock('@tanstack/react-virtual', async () => ({
 *     useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
 *   }))
 */

// Mirror the components' ROW_HEIGHT estimate; the exact value is irrelevant to
// assertions (nothing reads pixel offsets in jsdom) — it only needs to be
// stable and non-zero.
const VROW = 40

export function passthroughVirtualizer({ count }: { count: number }) {
  return {
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * VROW,
        end: (index + 1) * VROW,
        size: VROW,
        lane: 0,
      })),
    getTotalSize: () => count * VROW,
  }
}

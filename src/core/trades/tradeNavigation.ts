// Pure trade-navigation logic for the Trade Detail Modal's prev/next + position.
// Dependency-free: NO electron / fs / node / react / lightweight-charts imports
// (mirrors src/core/trades/executionStats.ts's discipline). It operates on the
// DISPLAYED ordered ids + the open trade's id, so it ports to the Next.js target
// unchanged. No wrap-around: prev/next are null at the ends.

export interface TradeNavPosition {
  /** Id of the previous trade in displayed order; null at the first item (no wrap). */
  prevId: number | null
  /** Id of the next trade in displayed order; null at the last item (no wrap). */
  nextId: number | null
  /** 0-based index of currentId in the list; -1 if absent (or current is null). */
  index: number
  /** List length. */
  total: number
}

/**
 * Given the DISPLAYED ordered trade ids and the open trade's id, return the
 * prev/next neighbor ids and the position. No wrap: prevId is null at the first
 * item, nextId is null at the last. When currentId is null or not in the list,
 * index is -1 and both neighbors are null (total still reflects the list length).
 */
export function getTradeNavPosition(
  orderedIds: number[],
  currentId: number | null,
): TradeNavPosition {
  const total = orderedIds.length
  const index = currentId == null ? -1 : orderedIds.indexOf(currentId)
  return {
    prevId: index > 0 ? orderedIds[index - 1] : null,
    nextId: index >= 0 && index < total - 1 ? orderedIds[index + 1] : null,
    index,
    total,
  }
}

// Pure nav-position logic for prev/next + position over a DISPLAYED ordered
// key list. Dependency-free: NO electron / fs / node / react / lightweight-charts
// imports (mirrors src/core/trades/executionStats.ts's discipline). Generic over
// the key type since the v0.2.6 day/week-modal cycling: number trade ids (the
// Trade Detail Modal precedent) and string date keys (the calendar Day/Week
// walks) share one contract — operate on the DISPLAYED ordered keys + the open
// key, no wrap-around: prev/next are null at the ends. Ports to the Next.js
// target unchanged.

export interface NavPosition<K extends string | number> {
  /** Key of the previous item in displayed order; null at the first item (no wrap). */
  prevId: K | null
  /** Key of the next item in displayed order; null at the last item (no wrap). */
  nextId: K | null
  /** 0-based index of currentKey in the list; -1 if absent (or current is null). */
  index: number
  /** List length. */
  total: number
}

/** The Trade Detail Modal's original number-keyed shape — now an alias. */
export type TradeNavPosition = NavPosition<number>

/**
 * Given the DISPLAYED ordered keys and the open item's key, return the
 * prev/next neighbor keys and the position. No wrap: prevId is null at the
 * first item, nextId is null at the last. When currentKey is null or not in
 * the list, index is -1 and both neighbors are null (total still reflects the
 * list length).
 */
export function getNavPosition<K extends string | number>(
  orderedKeys: readonly K[],
  currentKey: K | null,
): NavPosition<K> {
  const total = orderedKeys.length
  const index = currentKey == null ? -1 : orderedKeys.indexOf(currentKey)
  return {
    prevId: index > 0 ? orderedKeys[index - 1] : null,
    nextId: index >= 0 && index < total - 1 ? orderedKeys[index + 1] : null,
    index,
    total,
  }
}

/** Number-keyed wrapper — the Trade Detail Modal's original surface, kept so
 *  TradesTable and its unit suite stand unchanged. */
export function getTradeNavPosition(
  orderedIds: number[],
  currentId: number | null,
): TradeNavPosition {
  return getNavPosition(orderedIds, currentId)
}

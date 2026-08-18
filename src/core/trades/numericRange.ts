// v0.2.7 Feature 4 — THE numeric range filter. One implementation, every column.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React imports.
//
// There was no range idiom in the codebase before this — the trades filter handled
// symbol, side, duration buckets, dates, outcome and the three multi-selects, none of
// which is a min/max over a number. Fifteen new numeric columns each wanting one is
// exactly how a codebase ends up with fifteen slightly different comparisons, so this
// is deliberately the only one, and a source guard keeps it that way.
//
// THE NULL RULE, stated once here so no caller re-decides it:
//   A null value is EXCLUDED by any active range, and INCLUDED when no range is set.
// A null is not a zero. "Trades with R between 1 and 2" cannot honestly include a
// trade whose R was never measured — but "no filter" must not silently drop the
// eleven of twenty-eight trades that have no R at all. Treating null as 0 would put
// unmeasured trades inside every range that spans zero, which is most of them.

export interface NumericRange {
  /** Inclusive lower bound. Null / undefined means unbounded below. */
  min?: number | null
  /** Inclusive upper bound. Null / undefined means unbounded above. */
  max?: number | null
}

/** True when neither bound is set — the filter is dormant and admits everything,
 *  including rows whose value is null. */
export function isRangeActive(r: NumericRange | null | undefined): boolean {
  if (!r) return false
  const hasMin = r.min != null && Number.isFinite(r.min)
  const hasMax = r.max != null && Number.isFinite(r.max)
  return hasMin || hasMax
}

/** Does `value` satisfy `range`? Both bounds inclusive.
 *
 *  An inverted range (min greater than max) matches NOTHING rather than throwing or
 *  silently swapping the bounds — a user mid-typing has expressed an empty set, and
 *  quietly reinterpreting their input would show rows they did not ask for. */
export function matchesRange(
  value: number | null | undefined,
  range: NumericRange | null | undefined,
): boolean {
  if (!isRangeActive(range)) return true
  if (value == null || !Number.isFinite(value)) return false // the null rule
  const { min, max } = range!
  const hasMin = min != null && Number.isFinite(min)
  const hasMax = max != null && Number.isFinite(max)
  if (hasMin && hasMax && (min as number) > (max as number)) return false
  if (hasMin && value < (min as number)) return false
  if (hasMax && value > (max as number)) return false
  return true
}

/** Apply a map of column-id -> range to a list, using a per-column value reader.
 *  Every range must pass (AND across columns), matching how the existing filters
 *  compose. */
export function applyRanges<T>(
  rows: readonly T[],
  ranges: Readonly<Record<string, NumericRange>>,
  valueOf: (row: T, columnId: string) => number | null | undefined,
): T[] {
  const active = Object.entries(ranges).filter(([, r]) => isRangeActive(r))
  if (active.length === 0) return [...rows]
  return rows.filter((row) =>
    active.every(([columnId, range]) => matchesRange(valueOf(row, columnId), range)),
  )
}

// Session 3 — pure id-ordering helper.
//
// Re-orders a result set to match an input id list, dropping ids with no
// matching row and de-duplicating repeated ids. Extracted from the
// trade_technicals bulk-backfill SQL path (electron/trades/list.ts) so the
// ordering logic is unit-testable without a database — SQL `WHERE id IN (...)`
// returns natural row order, not the caller's requested order, so the re-sort
// has to live somewhere testable.
//
// Generic over <T> via a getId extractor, so the same primitive works for any
// row shape keyed by a numeric id. Pure per ARCHITECTURE rule 1: no imports,
// no Node-only APIs, no console — runs unchanged in a web/server context.

/**
 * Return `rows` re-ordered to match `ids`, indexing by `getId(row)`.
 *
 * Contract:
 *  - Empty `rows` or empty `ids` → `[]`.
 *  - Output order follows `ids`, not the order of `rows`.
 *  - An id in `ids` with no matching row is skipped (no placeholder).
 *  - Repeated ids in `ids` yield their row at most once (first position wins).
 *  - If `rows` contains duplicate ids, the FIRST occurrence wins.
 *  - Rows are returned by reference — no cloning.
 */
export function orderByIds<T>(
  rows: readonly T[],
  ids: readonly number[],
  getId: (row: T) => number,
): T[] {
  if (rows.length === 0 || ids.length === 0) return []

  // Index rows by id; first occurrence wins on duplicates.
  const map = new Map<number, T>()
  for (const row of rows) {
    const id = getId(row)
    if (!map.has(id)) map.set(id, row)
  }

  // Walk ids in order, de-duplicating and skipping misses.
  const seen = new Set<number>()
  const out: T[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const row = map.get(id)
    if (row !== undefined) out.push(row)
  }
  return out
}

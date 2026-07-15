// Pure per ARCHITECTURE rule 1: no electron / fs / db imports.
//
// The week-cell top-mistake fold (djsevans87 ticket #7 reinstatement). Input is
// one row per (trade, mistake) pair for the week, straight off the
// trade_mistake → mistake_def junction — the authoritative store. The deleted
// v0.2.5 compute (2f51c52) parsed the orphaned legacy JSON column and
// broke ties by Map-insertion order (first-encountered won, so the winner
// depended on trade/tag ordering); this rebuild is DELIBERATELY deterministic:
// count desc, then mistake_def.sort_position asc (the vocabulary's own order),
// then name asc.
export interface MistakeTagRow {
  name: string
  sort_position: number
}

export function topMistake(
  rows: MistakeTagRow[],
): { name: string; count: number } | null {
  if (rows.length === 0) return null
  const agg = new Map<string, { count: number; sort_position: number }>()
  for (const r of rows) {
    const a = agg.get(r.name)
    if (a) a.count += 1
    else agg.set(r.name, { count: 1, sort_position: r.sort_position })
  }
  let top: { name: string; count: number; sort_position: number } | null = null
  for (const [name, a] of agg) {
    if (
      top === null ||
      a.count > top.count ||
      (a.count === top.count &&
        (a.sort_position < top.sort_position ||
          (a.sort_position === top.sort_position && name < top.name)))
    ) {
      top = { name, count: a.count, sort_position: a.sort_position }
    }
  }
  return top ? { name: top.name, count: top.count } : null
}

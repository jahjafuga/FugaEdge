// Beat 2 — the Technicals tab's honest in-tab scope line. The Analytics page
// subtitle ("N round trips analyzed") is ALL-TIME and shared across every tab;
// the Technicals tab is date-scoped (30-day default) and further narrowed by its
// own ticker/playbook filters. This helper builds a line stating the tab's OWN
// population so the all-time subtitle never reads as if it scopes this tab (the
// "vanishing 255" report).
//
// `count` is filteredRows.length — the date range AND active ticker/playbook
// filters, i.e. exactly the population the header-strip cards are computed over.
// So the wording is filter-aware: when a ticker/playbook filter is active the
// line must NOT name the date range (the population is narrower than the range) —
// it reads "matching filters" instead.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

export interface TechnicalsScopeLabelInput {
  /** filteredRows.length — round trips in range AND matching active filters. */
  count: number
  /** The all-time total (the page subtitle's population) — the "of Y" side
   *  of the bridge. REQUIRED: the page's loading gate guarantees the
   *  analytics payload exists before the tab mounts, so no fallback branch
   *  exists (the 2026-07-03 definition-drift fix). */
  totalCount: number
  /** A ticker filter is narrowing the set (filters.ticker !== ''). */
  hasTickerFilter: boolean
  /** A playbook filter is narrowing the set (filters.playbookName !== null). */
  hasPlaybookFilter: boolean
  /** Human phrase for the active date range, e.g. "the last 30 days". Only used
   *  in the no-filter case; ignored when a filter is active. */
  rangeLabel: string
}

export function technicalsScopeLabel({
  count,
  totalCount,
  hasTickerFilter,
  hasPlaybookFilter,
  rangeLabel,
}: TechnicalsScopeLabelInput): string {
  // Singular/plural stays keyed on X (the windowed count) — the pre-fix
  // behavior, preserved exactly.
  const noun = count === 1 ? 'round trip' : 'round trips'
  // Filter active → the population is narrower than the date range, so naming the
  // range would overclaim. State "matching filters" and leave the range unnamed.
  // The X-of-Y bridge survives filtering — Y is all-time either way.
  if (hasTickerFilter || hasPlaybookFilter) {
    return `${count} of ${totalCount} ${noun} matching filters`
  }
  return `${count} of ${totalCount} ${noun} in ${rangeLabel}`
}

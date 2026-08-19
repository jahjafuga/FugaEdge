// v0.2.7 Feature 1, the missing half — the Overview tab's scope vocabulary.
//
// THE RULE: a scope label reflects the ACTIVE filter, or it says nothing. A chart
// headed "All time" while showing seven days is worse than an untitled chart — and
// a chart headed "All time" while showing one ticker is the same lie in a different
// dimension. The titles reacted to the date range and to nothing else, so any of the
// six non-date filters could narrow the data underneath a heading that still claimed
// the whole book.
//
// This is the Technicals tab's answer applied to Overview. src/core/technicals/
// scopeLabel.ts was written for the same defect (the "vanishing 255" report) and
// established the two rules reused here: when a non-date filter narrows the set,
// naming the date range OVERCLAIMS; and the honest population belongs in an in-tab
// X-of-Y line rather than in the page subtitle, which is all-time by ruling and
// shared across all nine tabs.
//
// ONE vocabulary on purpose: the chart titles and the count line render the SAME
// scope string, so the heading above a chart and the line above the filter can never
// describe different books.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports.

import type { OverviewFilters } from './types'

export interface OverviewScopeInput {
  /** Human label for the active date window, e.g. "All time", "7 days", "YTD". */
  rangeLabel: string
  /** True when any NON-date filter is narrowing the set. */
  narrowed: boolean
}

/**
 * The scope phrase for this tab, e.g. "All time", "7 days", "Filtered",
 * "7 days, filtered".
 *
 * "All time" is dropped entirely once something else narrows the set: the date
 * scope really is unbounded, but the population is not, and saying "All time" over
 * a filtered subset is the overclaim the rule exists to prevent. A REAL window is
 * kept and the narrowing added beside it — a 7-day range is a genuine constraint
 * worth naming, it just is not the only one in play.
 */
export function overviewScope({ rangeLabel, narrowed }: OverviewScopeInput): string {
  if (!narrowed) return rangeLabel
  if (isUnbounded(rangeLabel)) return 'Filtered'
  return `${rangeLabel}, filtered`
}

/** The all-time label carries no constraint, so under narrowing it has nothing left
 *  to contribute. Compared case-insensitively against quickKeyLabel('all'). */
function isUnbounded(rangeLabel: string): boolean {
  return rangeLabel.trim().toLowerCase() === 'all time'
}

export interface OverviewCountInput {
  /** Round trips after every active filter — the population the widgets describe. */
  count: number
  /** The tab's own universe (closed round trips handed to it), the "of Y" side. */
  total: number
  /** The scope phrase from overviewScope, so both read the same vocabulary. */
  scope: string
}

/**
 * The honest in-tab population line: "1 of 28 round trips · 7 days".
 *
 * The page subtitle says "N round trips — all time" and stays that way: it is a
 * static all-time fact shared by every tab (the 2026-07-03 definition-drift ruling),
 * and making it react to one tab's filters would make it wrong on the other eight.
 * This line is how the Overview tab states its OWN population instead.
 *
 * Pluralised on the FILTERED count, matching technicalsScopeLabel.
 */
export function overviewCountLine({ count, total, scope }: OverviewCountInput): string {
  const noun = count === 1 ? 'round trip' : 'round trips'
  return `${count} of ${total} ${noun} · ${scope}`
}

/**
 * Is anything OTHER than the date range narrowing the set?
 *
 * The range is excluded because it is already named by rangeLabel; this answers the
 * separate question of whether that name is the whole story.
 */
export function isNarrowedBeyondRange(f: OverviewFilters): boolean {
  return (
    f.symbol.trim() !== '' ||
    f.playbooks.length > 0 ||
    f.catalysts.length > 0 ||
    f.mistakes.length > 0 ||
    f.side !== 'all' ||
    f.duration !== 'all'
  )
}

// v0.2.7 — WHAT EDGE SAYS BACK.
//
// This line was built inline in the bubble component from two values: the live
// filtered count and the applied list. That made it impossible to distinguish
// "no filters applied" from "filters applied, and everything matched" — both
// produce the whole book. So a query that resolved to NOTHING logged the full
// book count and read as success. Three of them did, in a row, on screen.
//
// The count was never WRONG. It was the count of a filter that had not been
// applied, reported as though it had. The fix is not better wording: it is
// refusing to print a number when there is no result set behind it.
//
// PURE per ARCHITECTURE #1 — a string function over three values, testable
// without mounting a page. It would run inside a Next.js page unmodified.

import { isFiltering, type TradesFilterState } from './tradesFilter'

export interface ResponseInput {
  /** The live filtered count the page is showing. */
  count: number
  /** One line per consumed token, from the resolver. */
  applied: string[]
  /** Contiguous runs of text that matched nothing — the model seam. */
  unresolved: string[]
  /** v0.2.7 -- the row count the ask asked to SHOW, or null. Threaded in
   *  because the count alone cannot tell the truth once a limit exists: the
   *  number MATCHED and the number SHOWN are different facts, and reporting
   *  the limit as the match would be the same lie this file was written to
   *  stop. */
  limit?: number | null
  /** The state this ask composed ON, and the state it produced.
   *
   *  The line makes claims about the STATE, and until these arrived it made
   *  them from `applied`, which only describes the ASK. Both wordings it has
   *  worn were true on one path and false on another for exactly that reason.
   *  Supplied together or not at all; without them the line makes no claim. */
  before?: TradesFilterState
  after?: TradesFilterState
}

/** Every array field, both sides of every pair. */
const ARRAYS = [
  'playbookIds', 'mistakeKeys', 'catalystTypes', 'regions',
  'countries', 'sectors', 'industries',
  'excludePlaybookIds', 'excludeMistakeKeys', 'excludeCatalystTypes',
  'excludeRegions', 'excludeCountries', 'excludeSectors', 'excludeIndustries',
] as const

/** What a value reads as. A mistake key carries its own name; a playbook is a
 *  numeric id and resolving it would need a lookup this file has no business
 *  holding, so it is named by its KIND rather than shown as a bare number. */
function labelOf(v: unknown): string {
  if (v === null) return 'the untagged ones'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return 'a playbook'
  if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name: unknown }).name)
  return String(v)
}

/** Values the ask REMOVED from the state it composed on.
 *
 *  The resolver cancels a value asked for and against at the same time, wiping
 *  it from both sides. That is deliberate and is not changed here -- but a
 *  filter the user set vanishing without a word is the mirror of an invisible
 *  filter, so the line has to say it happened. */
function removedValues(before: TradesFilterState, after: TradesFilterState): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const key of ARRAYS) {
    const was = (before[key] ?? []) as unknown[]
    const now = (after[key] ?? []) as unknown[]
    for (const v of was) {
      const label = labelOf(v)
      const stillThere = now.some((w) => labelOf(w) === label)
      if (stillThere || seen.has(label)) continue
      seen.add(label)
      out.push(label)
    }
  }
  return out
}

const quoteList = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ')

/** The logged response for one committed ask. */
export function responseLine({
  count, applied, unresolved, limit, before, after,
}: ResponseInput): string {
  // NOTHING APPLIED. This ask ran no filter, so there is no result set and no
  // number to report — printing the book's own size here is the defect this
  // file exists to stop. Say what could not be read instead, so the sentence
  // the user typed is what comes back at them.
  //
  // AND IT SPEAKS ONLY FOR THIS ASK. It used to say "nothing was filtered",
  // which is a claim about the STATE — and the state is whatever the LAST
  // readable ask left in force. Type a sentence Edge cannot read over a live
  // filter and the line said nothing was filtered while the header counted a
  // filtered book and the strip named the exclusion doing it. Three statements,
  // two of them true.
  //
  // AND ONE WORDING CANNOT COVER EVERY PATH. "Nothing was filtered" is false
  // over a live filter. "Your filters are unchanged" is false when the ask
  // WIPED one -- which happens whenever a value is asked for and against, and
  // the resolver cancels both sides. Each was true on one path and false on
  // another because both were claims about the STATE inferred from the ASK.
  // The line is shown the state now, and says only what it can see.
  if (applied.length === 0) {
    // Pure filler still answers: silence would read as a hang.
    const head =
      unresolved.length > 0 ? `I could not read ${quoteList(unresolved)}` : 'I could not read that'

    // NOT SHOWN THE STATE, SO NO CLAIM ABOUT IT. The same discipline as
    // refusing to print a count with no result set behind it.
    if (!before || !after) return `${head}.`

    const removed = removedValues(before, after)
    if (removed.length > 0) {
      return `${head} — and I dropped ${quoteList(removed)}, which you asked for and against.`
    }
    return isFiltering(after)
      ? `${head} — your filters are unchanged.`
      : `${head} — nothing is filtered.`
  }

  // The MATCHED count, always. A limit hides rows that qualified, so the number
  // found and the number shown are both facts and the line carries both -- but
  // only when the limit actually hides something.
  const hiding = limit != null && limit < count
  const trades =
    `${count} trade${count === 1 ? '' : 's'}` +
    (hiding ? ` (showing ${limit})` : '') +
    ` - ${applied.join(', ')}`

  // PARTLY APPLIED. A partial answer is still an answer, and the count is real
  // — but the user must be told which half of their sentence was thrown away,
  // or they will read the number as covering all of it.
  return unresolved.length > 0
    ? `${trades} (ignored ${quoteList(unresolved)})`
    : trades
}

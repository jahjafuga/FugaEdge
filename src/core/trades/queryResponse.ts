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
import type { AmbiguousToken } from './queryResolver'

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
  /** v0.2.7 -- THE SENTENCE THE TRADER ACTUALLY TYPED. The refusal used to
   *  quote `unresolved`, which holds the SPAN that failed, not the words the
   *  trader wrote: on the largest book "show me my nrva trdaes" came back
   *  naming "nrva trdaes", a pair the trader never typed as a unit. Optional,
   *  so every caller that does not supply it keeps the old head exactly. */
  typed?: string
  /** v0.2.7 -- how many readings are on offer, and how many were kept. Two
   *  different asks were producing byte-identical sentences because the only
   *  thing separating them was an offer the line never mentioned. */
  offers?: { shown: number; total: number }
  /** v0.2.7 -- rows a RANGE dropped because the column was never measured.
   *  Counted from the rows BEFORE the filter ran, because a range removes
   *  exactly the rows this number describes. Null when no range is active. */
  coverage?: { skipped: number; column: string } | null
  /** v0.2.7 -- rows an EXCLUSION kept that were never measured. The opposite
   *  shape: these rows are still in the result, so the count comes from the
   *  survivors. Null when no exclusion is in force. */
  excluded?: { skipped: number; column: string } | null
  /** v0.2.7 slice B -- the answer sentence, already computed over the same
   *  rows the count came from, or null. Passed in rather than computed here
   *  because this module is given a COUNT, not a row set, and inventing a
   *  second source of rows is how two numbers on one line start to differ. */
  answer?: string | null
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
  count, applied, unresolved, limit, before, after, answer, typed, offers, coverage,
  excluded,
}: ResponseInput): string {
  // AN ANSWER LEADS. It is what was asked for; the filter it was computed
  // over follows in the same breath so the number can be checked rather
  // than trusted. There is no path where an answer appears next to an
  // unread word: the resolver drops the answer at the strict boundary with
  // everything else, so by the time one arrives here the ask was read whole.
  if (answer) {
    return applied.length > 0 ? `${answer} (${applied.join(', ')})` : answer
  }
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
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-EIGHT, measured by beat one hundred
    // eighty-six. WAS: `I could not read ${quoteList(unresolved)}`, which names
    // the SPAN that failed. On the largest book that made "show me my nrva
    // trdaes" come back as "nrva trdaes" -- two words the trader never typed
    // together. When the caller supplies what was typed, that is what is
    // quoted; without it the old head is untouched.
    const head = typed
      ? `I could not read "${typed}"`
      : unresolved.length > 0
        ? `I could not read ${quoteList(unresolved)}`
        : 'I could not read that'

    // NOT SHOWN THE STATE, SO NO CLAIM ABOUT IT. The same discipline as
    // refusing to print a count with no result set behind it.
    if (!before || !after) return `${head}.`

    const removed = removedValues(before, after)
    if (removed.length > 0) {
      return `${head}. I dropped ${quoteList(removed)}, which you asked for and against.`
    }
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-EIGHT, measured by beat one hundred
    // eighty-six. WAS: `${head} - nothing is filtered.` -- true, and read as a
    // result, because the header beside it was counting the whole book. The
    // line now says what the trader is looking AT.
    //
    // STILL NO COUNT. This file already rules that a number must not leak into
    // a failure line, and that ruling is not being reversed: a count here
    // would read as an answer to a question that was never understood.
    return isFiltering(after)
      ? `${head}. Your filters are unchanged.`
      : `${head}. Nothing is filtered, so this is your whole book.`
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
  // W4 and W5 -- THE OFFERS ARE PART OF THE ANSWER. Two different asks were
  // producing byte-identical sentences because the only thing between them was
  // an offer the line never mentioned. And a truncated list that does not say
  // it was truncated is the same silence this file exists to break.
  const offered =
    offers && offers.total > 0
      ? offers.total > offers.shown
        ? `. I have ${offers.shown} readings to offer and ${offers.total - offers.shown} more I did not show`
        : `. I have ${offers.total} reading${offers.total === 1 ? '' : 's'} to offer`
      : ''

  // WHAT THE FILTER COULD NOT SEE. A range DROPS the unmeasured row and an
  // exclusion KEEPS it, so the two say different things and never both apply
  // to one column. Each clause appears only when there is something to say.
  const cover =
    coverage && coverage.skipped > 0
      ? `, and ${coverage.skipped} never measured`
      : excluded && excluded.skipped > 0
        ? `, of which ${excluded.skipped} were never measured`
        : ''
  return unresolved.length > 0
    ? `${trades}${cover} (ignored ${quoteList(unresolved)})${offered}`
    : `${trades}${cover}${offered}`
}

/** THE MOST OFFERS A TRADER IS SHOWN AT ONCE. Measured before it was chosen:
 *  on the three books the matrix reaches eight and the frozen corpora reach
 *  EIGHTY, and eighty chips is not a choice, it is a wall.
 *
 *  THE COUNT IS ALWAYS NAMED. A silent truncation is the same dishonesty this
 *  campaign exists to remove, so the caller is told how many were kept and how
 *  many exist. */
export const OFFER_CEILING = 10

/** COLLAPSE OFFERS THAT NAME THE SAME ENTRY, AND CAP THE LIST.
 *
 *  WHY NOT BY DISPLAY ALONE. Beat one hundred eighty-seven measured thirteen
 *  displays shared across kinds on three books -- "China" is a country and a
 *  region, "UK" is a region and a symbol -- and found ZERO runs in three
 *  thousand seven hundred and fifty-three where a shared display arrived from
 *  two texts. That is a fact about THREE BOOKS, and a fourth could break it.
 *
 *  SO IDENTITY IS USED WHERE IT EXISTS. The resolver knows the KIND of every
 *  entry it offers and hands it over through `kindOf`; the merge is keyed on
 *  display AND kind. Where no kind is known -- the superlative candidates, the
 *  include-or-exclude pair -- the key falls back to the display, which is
 *  correct because those are not entries at all. */
export function dedupeOffers(
  offers: readonly AmbiguousToken[],
  kindOf?: (display: string, text: string) => number | undefined,
): AmbiguousToken[] {
  const seen = new Set<string>()
  const out: AmbiguousToken[] = []
  let kept = 0
  for (const a of offers) {
    const candidates: string[] = []
    for (const c of a.candidates) {
      const k = kindOf ? kindOf(c, a.text) : undefined
      const key = k === undefined ? c : `${k}\u0000${c}`
      if (seen.has(key)) continue
      if (kept >= OFFER_CEILING) continue
      seen.add(key)
      candidates.push(c)
      kept += 1
    }
    if (candidates.length > 0) out.push({ ...a, candidates })
  }
  return out
}

/** How many distinct readings the offers hold, before the ceiling. */
export function countOffers(
  offers: readonly AmbiguousToken[],
  kindOf?: (display: string, text: string) => number | undefined,
): number {
  const seen = new Set<string>()
  for (const a of offers) {
    for (const c of a.candidates) {
      const k = kindOf ? kindOf(c, a.text) : undefined
      seen.add(k === undefined ? c : `${k}\u0000${c}`)
    }
  }
  return seen.size
}

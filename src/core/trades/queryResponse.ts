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
}

const quoteList = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ')

/** The logged response for one committed ask. */
export function responseLine({ count, applied, unresolved, limit }: ResponseInput): string {
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
  // "Your filters are unchanged" is true either way, so the line needs no
  // knowledge of the state to stop lying about it — and what IS in force is
  // already named on screen by the exclusion strip beside it.
  if (applied.length === 0) {
    return unresolved.length > 0
      ? `I could not read ${quoteList(unresolved)} — your filters are unchanged.`
      : // Pure filler: nothing applied AND nothing left over to quote. Silence
        // here would read as a hang, so it still answers.
        'I could not read that — your filters are unchanged.'
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

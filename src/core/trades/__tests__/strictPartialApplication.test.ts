// v0.2.7 — WHEN ANYTHING GOES UNREAD, NOTHING APPLIES.
//
// THE MEASUREMENT. Thirty-five sentences a momentum trader would actually type,
// frozen before anything ran, driven across three books: one hundred and five
// runs produced THIRTY-EIGHT answers that applied a filter nobody asked for,
// fourteen of them with a non-zero row count and nothing on screen to
// contradict them. A trader asking about halt resumes was shown twelve trades
// from the United Arab Emirates, because "rate" reaches inside "Emi-rate-s". A
// question about the weather returned a trade. A misspelling turned a narrow
// ask into five hundred and twenty-four of five hundred and twenty-eight rows.
//
// TEN CONFIGURATIONS WERE MEASURED ACROSS NEARLY THREE THOUSAND RUNS. Tier work
// alone — raising floors, converting fuzzy tiers to offers — took thirty-eight
// silent wrongs to twenty-nine at best. The rule in this file took it to two,
// and combined with two tier changes, to ZERO on both corpora, all three books.
//
// THE RULE. After resolution, if any CONTENT token was left unread, the whole
// ask applies nothing. Stopwords and fillers are not content — they carry
// marks 'stop' and never reach `unresolved`. A token left UNCLAIMABLE by a
// deliberate refusal IS content, and that is the whole point: declining to read
// a word does not license answering the rest of the sentence around it.
//
// WHAT IT COSTS, and the price was accepted rather than discovered. Nine runs
// that were correct became refusals, and eleven partial answers with them. The
// clearest loss: "entries more than five percent extended from the 9 ema"
// resolved correctly to the nine's band and now refuses.
//
// WHY IT REFUSES -- MEASURED IN BEAT 154, and the sentence that stood here
// until then was a GUESS. It read "because the phrasing carries words the
// resolver cannot read", and it offered widening the filler and grammar sets
// as the cure. Beat 154 re-drove all nine and that cure is not there. The
// sentence refuses because a comparison with NO COLUMN in its window applies
// nothing by design, and "over five percent extended from the 9 ema" -- built
// entirely from operators that have shipped since long before the boundary --
// refuses in exactly the same way. Recovering it needs the band and the
// comparator to share a column, which is a feature and not a word list.
// Nothing in the nine was recovered by widening. See comparatorPhrases.test.ts
// for what was measured and what shipped instead.
//
// AN UNREADABLE ASK APPLIES NOTHING; IT DOES NOT WIPE THE SCREEN. The discard
// restores the state this ask INHERITED, not an empty filter set. The harness
// that measured the rule always started from an empty base and so could never
// have caught the difference. RF9 exists for exactly that gap.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters, type TradesFilterState } from '../tradesFilter'
import { responseLine } from '../queryResponse'

const NOW = new Date('2026-08-22T15:00:00')

/** Built so each probe differs from its neighbour in exactly one way. The
 *  mistake name carries "loss" deep inside it, which is the substring reach
 *  that produced the worst measured run. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: [],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [{ axis: 'psychological', name: 'Revenge trade (after a loss)' }],
} as unknown as ResolverVocabulary

const r = (text: string, base?: TradesFilterState) =>
  resolveQuery(text, BOOK, NOW, base ?? emptyFilters())

// --- RF1 : ONE UNREAD CONTENT TOKEN DISCARDS EVERYTHING ----------------------

describe('RF1 an unread content token discards the whole ask', () => {
  it('"nrva zzzq" applies NOTHING, even though the ticker was understood', () => {
    // The ticker resolves perfectly. That is precisely the case worth refusing:
    // a partly-understood sentence produces a confident, narrow, wrong answer.
    expect(r('nrva zzzq').state).toEqual(emptyFilters())
  })

  it('and the unread word is still named', () => {
    expect(r('nrva zzzq').unresolved).toContain('zzzq')
  })
})

// --- RF2 : THE BOUNDARY DOES NOT OVER-FIRE -----------------------------------

describe('RF2 a fully consumed sentence still applies', () => {
  it('"nrva" alone resolves the symbol', () => {
    expect(r('nrva').state.symbol).toBe('NRVA')
  })
})

// --- RF3 : A SUBSTRING HIT ASKS ---------------------------------------------

describe('RF3 a substring one-hit offers rather than applying', () => {
  it('"loss" reaches inside the mistake name and is OFFERED, not applied', () => {
    const out = r('loss')
    expect(out.state.mistakeKeys).toEqual([])
    expect(out.ambiguous.map((a) => a.text)).toContain('loss')
  })
})

// --- RF4 : THE SYMBOL FLOOR IS THREE, ASSERTED BY KIND -----------------------

describe('RF4 symbols need three characters now, not two', () => {
  it('a THREE-letter symbol prefix still applies', () => {
    expect(r('nrv').state.symbol).toBe('NRVA')
  })

  it('a TWO-letter symbol prefix reaches nothing', () => {
    // And because it reaches nothing, the strict boundary then discards -- so
    // this asserts the floor through the state, which is what a trader sees.
    expect(r('nr').state).toEqual(emptyFilters())
    expect(r('nr').unresolved).toContain('nr')
  })
})

// --- RF5 : TIER ONE IS UNTOUCHED --------------------------------------------

describe('RF5 an exact hit still applies at any length and any kind', () => {
  it('a two-character country code resolves', () => {
    expect(r('us').state.countries).toEqual(['US'])
  })
})

// --- RF6 : FILLERS ARE NOT CONTENT ------------------------------------------

describe('RF6 stopwords and fillers do not trigger the discard', () => {
  it('"show me the nrva trades" still applies, and names nothing unread', () => {
    const out = r('show me the nrva trades')
    expect(out.unresolved).toEqual([])
    expect(out.state.symbol).toBe('NRVA')
  })
})

// --- RF7 : AN UNCLAIMABLE TOKEN IS CONTENT ----------------------------------

describe('RF7 a token left unclaimable by a refusal still counts as unread', () => {
  it('"nrva no" discards, because the ungoverned negator was never read', () => {
    // Beat 133 ruled that a refused word may not be claimed by another pass and
    // must come back named. It did not rule whether the REST of the sentence
    // still applies. This is that second question, answered: it does not.
    const out = r('nrva no')
    expect(out.unresolved).toContain('no')
    expect(out.state).toEqual(emptyFilters())
  })
})

// --- RF8 : WHAT THE TRADER READS --------------------------------------------

describe('RF8 the response says nothing was filtered and names the words', () => {
  it('driven through responseLine itself, not read off the applied array', () => {
    const base = emptyFilters()
    const out = r('nrva zzzq', base)
    const line = responseLine({
      count: 140, applied: out.applied, unresolved: out.unresolved,
      limit: out.state.limit ?? null, before: base, after: out.state,
    })
    expect(line).toContain('could not read')
    expect(line).toContain('zzzq')
    expect(line).not.toContain('symbol NRVA')
  })
})

// --- RF9 : THE DISCARD RESTORES, IT DOES NOT WIPE ---------------------------

/** R228. The harness that measured this rule always passed an empty base, so it
 *  could not distinguish "apply nothing" from "clear everything". On screen the
 *  difference is total: a trader with a live filter types an unreadable
 *  sentence and must not lose the view they already had. */
describe('RF9 an unreadable ask leaves the inherited filters untouched', () => {
  const withPrior = (): TradesFilterState => ({ ...emptyFilters(), outcome: 'losers' })

  it('the prior filter survives', () => {
    expect(r('nrva zzzq', withPrior()).state.outcome).toBe('losers')
  })

  it('and nothing new is applied on top of it', () => {
    expect(r('nrva zzzq', withPrior()).state.symbol).toBe('')
  })

  it('the inherited state is returned whole, not rebuilt empty', () => {
    expect(r('nrva zzzq', withPrior()).state).toEqual(withPrior())
  })
})

// v0.2.7 — "MORE THAN" IS AN OPERATOR, NOT A WORD TO SWALLOW.
//
// WHAT THIS BEAT SET OUT TO DO AND DID NOT DO. Beat 150 left one question open:
// whether widening the filler and grammar sets recovers the NINE correct answers
// the strict boundary cost. Beat 154 re-drove all nine on the shipped resolver
// and measured the tokens each one actually left unread. The answer is NO, and
// the reason is different for each class:
//
//   THE TYPO CLASS -- "trdaes", "reusme", "bigest" -- three of the nine. A
//   misspelling is not filler. Refusing it and naming the word is the designed
//   behaviour and it stays.
//
//   THE BAND CLASS -- "entries more than five percent extended from the 9 ema",
//   three of the nine. NOT a filler problem at all. A comparison with no COLUMN
//   in its window applies nothing by design, and beat 154 proved the phrasing is
//   incidental: "over five percent extended from the 9 ema", using the operator
//   that has shipped all along, refuses in exactly the same way. Recovering it
//   needs the band and the comparator to share a column, which is a feature.
//
//   THE DIMENSION CLASS -- "price was below vwap the whole time" and "stopped
//   out for a full r", three of the nine. Every blocking token has a reading:
//   "price" is a column phrase, "whole" prefixes a playbook, "time" reaches an
//   industry, and "late", "stopped out" and "full r" each NAME something. The
//   stopword list's own standing rule refuses all of them.
//
// WHAT SHIPPED INSTEAD, because it measured clean. "at least" and "at most"
// already collapse two tokens into one operator. "more than", "less than",
// "greater than" and "fewer than" now reach MIN_OPS and MAX_OPS through the
// identical door. Sixteen column-anchored probes were driven on both trees and
// TEN moved from a refusal to a correct filter, while the three shapes that must
// keep refusing -- no value, no column, and a governing negator -- all held.
//
// AND THE FINDING THAT MATTERS MOST, pinned in RH5. Once the strict boundary
// ships, PROMOTING A WORD TO FILLER IS NEVER NEUTRAL. Every filler word removes
// a guard, because an unread token is now the thing that makes the whole ask
// refuse. "ones" is a pronoun with no reading in any named set and no vocabulary
// entry on any of the three measured books, at any kind, at any tier. It passes
// every test this list has ever used. Adding it turned one honest refusal into
// sixteen rows of "playbook Halt Resume Long" for a trader asking which trades
// they held THROUGH a halt -- a wrong answer with nothing on screen to
// contradict it. It is refused, and RH5 is why.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary, STOPWORDS } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'
import { responseLine } from '../queryResponse'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOW = new Date('2026-08-22T15:00:00')
const SRC = readFileSync(resolve(__dirname, '..', 'queryResolver.ts'), 'utf8')

/** Shaped to the RH5 probe, which is the one part of this file that needs a book
 *  rather than a stub. "halt" must reach the playbook by prefix so the sentence
 *  HAS a wrong answer available to give, and "held" and "through" must reach
 *  mistake names so those tokens are consumed as OFFERS rather than falling
 *  through unread — on the demo book they do exactly that, and without them the
 *  sentence would refuse for a different reason and prove nothing. */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA'],
  regions: [],
  countries: [{ iso: 'US', name: 'United States' }],
  sectors: [],
  industries: [],
  playbooks: [{ id: 7, name: 'Halt Resume Long', tier: null }],
  catalystTypes: [],
  mistakes: [
    { axis: 'psychological', name: 'Revenge trade (after a loss)' },
    { axis: 'psychological', name: 'Greed - held too long / moved target' },
    { axis: 'psychological', name: 'Hold-and-hope (held a loser too long)' },
    { axis: 'risk', name: 'Traded through max loss' },
  ],
} as unknown as ResolverVocabulary

const r = (text: string) => resolveQuery(text, BOOK, NOW, emptyFilters())
const range = (text: string, col: string) =>
  (r(text).state.ranges as Record<string, unknown>)[col]

// --- RH1 : THE FOUR PHRASES RESOLVE -----------------------------------------

describe('RH1 a two-token comparator phrase reaches the same bound as one word', () => {
  it('"more than" is a minimum', () => {
    expect(range('price more than five', 'avg_buy')).toEqual({ min: 5, max: null })
  })

  it('"greater than" is the same minimum', () => {
    expect(range('price greater than five', 'avg_buy')).toEqual({ min: 5, max: null })
  })

  it('"less than" is a maximum', () => {
    expect(range('price less than ten', 'avg_buy')).toEqual({ min: null, max: 10 })
  })

  it('"fewer than" is the same maximum', () => {
    expect(range('shares fewer than one thousand', 'shares')).toEqual({ min: null, max: 1000 })
  })
})

// --- RH2 : THE COLLISIONS ----------------------------------------------------

describe('RH2 the one-word operators and the refusal shapes are untouched', () => {
  it('"vwap over five" is unchanged', () => {
    expect(range('vwap over five', 'vwap_dist_pct')).toEqual({ min: 5, max: null })
  })

  it('BOTH WAYS ROUND on one column, per beat 94', () => {
    // The same column, the same number, the two phrases that must disagree. A
    // single direction passes just as well when both are wired to 'min'.
    expect(range('hold time more than five', 'hold_time')).toEqual({ min: 5, max: null })
    expect(range('hold time less than five', 'hold_time')).toEqual({ min: null, max: 5 })
  })

  it('a phrase with NO VALUE still refuses', () => {
    expect(r('price more than').state).toEqual(emptyFilters())
    expect(r('price more than').unresolved).toContain('price more than')
  })

  it('a phrase with NO COLUMN still refuses', () => {
    // This is the shape that blocks "entries more than five percent extended
    // from the 9 ema", and it is deliberate: a bare bound with no column would
    // have to guess which column, and guessing is the thing being removed.
    expect(r('more than five').state).toEqual(emptyFilters())
    expect(r('more than five').unresolved).toContain('more than five')
  })

  it('a governing negator still refuses the phrase beside it', () => {
    const out = r('no more than five percent from vwap')
    expect(out.state).toEqual(emptyFilters())
    expect(out.unresolved).toContain('no')
  })
})

// --- RH3 : AN ALL-FILLER ASK IS STILL HONEST ---------------------------------

describe('RH3 a sentence of nothing but filler applies nothing and says so', () => {
  it('nothing is applied and nothing is claimed', () => {
    const out = r('show me all the trades')
    expect(out.state).toEqual(emptyFilters())
    expect(out.applied).toEqual([])
    const line = responseLine({
      count: 140, applied: out.applied, unresolved: out.unresolved,
      limit: out.state.limit ?? null, before: emptyFilters(), after: out.state,
    })
    expect(line).not.toContain('playbook')
  })
})

// --- RH4 : THE PHRASE TABLE IS A LITERAL -------------------------------------

describe('RH4 the four phrases are a named literal in the shipped source', () => {
  it('THAN_OPS is declared', () => {
    expect(SRC).toContain('const THAN_OPS')
  })

  it('and it carries exactly the four measured words, mapped to shipped ops', () => {
    const from = SRC.indexOf('const THAN_OPS')
    const body = SRC.slice(from, SRC.indexOf('}', from) + 1)
    expect(body).toContain("more: 'over'")
    expect(body).toContain("greater: 'over'")
    expect(body).toContain("less: 'under'")
    expect(body).toContain("fewer: 'under'")
    // "than" is the CONNECTOR, never an operator in its own right. If it ever
    // becomes a key, "than" alone starts reading as a comparison.
    expect(body).not.toContain('than:')
  })
})

// --- RH5 : THE WORDS THIS BEAT REFUSED ---------------------------------------

describe('RH5 filler is not neutral once the boundary is strict', () => {
  const REFUSED = ['ones', 'entries', 'was', 'late', 'stopped', 'out', 'full', 'r',
    'more', 'than', 'less', 'greater', 'fewer', 'price', 'whole', 'time', 'percent']

  it('not one of them is in the unconditional filler set', () => {
    for (const w of REFUSED) expect(STOPWORDS.has(w), w + ' became filler').toBe(false)
  })

  it('and here is the measured cost of adding just one of them', () => {
    // "ones" has no reading anywhere. It still cannot be filler, because the
    // pronoun is the ONLY thing making this ask refuse.
    const withPronoun = r('show me the ones i held through a halt')
    expect(withPronoun.state).toEqual(emptyFilters())
    expect(withPronoun.unresolved).toContain('ones')
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: swapping the pronoun for a word
    // that IS filler produced the wrong answer -- a question about holding
    // THROUGH a halt, answered with the Halt Resume Long playbook, with
    // nothing on screen to contradict it.
    //
    // THE WRONG ANSWER IS GONE, and RH5's point survives it. "halt" is four
    // characters of "Halt Resume Long", under the coverage floor, so the
    // playbook is now OFFERED rather than applied. The lesson this guard
    // exists for is unchanged: promoting a word to filler removes the token
    // that was making the ask refuse. It is now merely cheaper to be wrong
    // about, because the resolver asks instead of answering.
    const swapped = r('show me the trades i held through a halt')
    expect(swapped.state.playbookIds).toEqual([])
    expect(swapped.ambiguous.flatMap((a) => a.candidates)).toContain('Halt Resume Long')
  })
})

// --- RH6 : THE TYPO CLASS STAYS REFUSED, BY CHOICE ---------------------------

describe('RH6 a misspelling is still refused and still named', () => {
  it('"show me my nrva trdaes" applies nothing and names the typo', () => {
    const out = r('show me my nrva trdaes')
    expect(out.state).toEqual(emptyFilters())
    expect(out.unresolved).toContain('trdaes')
  })
})

// v0.2.7 — THE COMPARATOR HALF: window, precedence, magnitudes.
//
// THREE DEFECTS, all measured:
//
//   "float under 1 million" set float at most ONE. The word million was not a
//     magnitude -- only the glued suffix was -- so the number was wrong by six
//     orders of magnitude and the filter reported success. Unresolved would
//     have been honest; a wrong number that ran is not.
//   "under a float of 1m" resolved to nothing at all. The parser required the
//     column phrase to sit immediately before the operator and the value
//     immediately after it, so the phrasing a trader actually types missed.
//   "float" alone applied the MISTAKE "Float or RVOL criteria not met",
//     because pass one only claims a column when a comparator follows, and
//     pass three then takes the word as vocabulary.
//
// THE RULINGS these guards enforce:
//   PRECEDENCE, not similarity. A column phrase claims its word ONLY when an
//     operator AND a value are inside the window. The tiers and their floors
//     are untouched -- this is about which PASS gets the word, not about how
//     similar two strings are.
//   A BARE column phrase keeps today's behaviour. A column with no operator
//     and no value is not a filter, so the vocabulary reading is the only
//     actionable one and it keeps the word. There is nothing to choose
//     between, so there is no ambiguity prompt either.
//   An EXACT or LONGER vocabulary match still beats a windowed column claim --
//     the same law that let a real ticker beat the filler list and let "No
//     Setup" beat the negator.
//   A comparator with NO value is UNRESOLVED. Never a filter with a missing
//     or coerced number.
//
// THE WINDOW RULE, chosen by MEASUREMENT: across every phrasing on record the
// column phrase and the operator are separated by ZERO tokens ("float under
// 1m", "market cap under 500m") or by exactly ONE, and that one is always a
// stopword ("under A float of 1m", "float OF under 1m"). The column may sit on
// either side of the operator. So: an operator and a column phrase form a
// comparison when at most one stopword separates them, in either order, and
// the value is the first parseable value after both.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

/** The 528 book's shape -- the book these defects were measured on. The
 *  mistake name is the one that steals the word "float". */
const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA', 'ATPC'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
  ],
  sectors: ['Healthcare'],
  industries: ['Biotechnology'],
  playbooks: [{ id: 4, name: 'Micro Pullback', tier: 'A+' }],
  catalystTypes: ['Earnings'],
  mistakes: [
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
    { axis: 'technical', name: 'Stop too wide / risk undefined' },
    { axis: 'psychological', name: 'Overconfidence after a win' },
    { axis: 'technical', name: 'Entered below VWAP' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)
const rangesOf = (q: string, vocab: ResolverVocabulary = BOOK) => r(q, vocab).state.ranges

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 magnitude words', () => {
  it('"float under 1 million" is ONE MILLION, not one', () => {
    expect(
      rangesOf('float under 1 million'),
      'the number is wrong by six orders of magnitude',
    ).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"float under 1.5 million" carries the decimal', () => {
    expect(rangesOf('float under 1.5 million')).toEqual({
      float: { min: null, max: 1_500_000 },
    })
  })

  it('"float over 500 thousand" is five hundred thousand', () => {
    expect(rangesOf('float over 500 thousand')).toEqual({
      float: { min: 500_000, max: null },
    })
  })

  it('"market cap over 2 billion"', () => {
    expect(rangesOf('market cap over 2 billion')).toEqual({
      market_cap: { min: 2_000_000_000, max: null },
    })
  })

  it('the GLUED forms still work, unchanged', () => {
    expect(rangesOf('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
    expect(rangesOf('float under 500k')).toEqual({ float: { min: null, max: 500_000 } })
    expect(rangesOf('market cap over 2b')).toEqual({
      market_cap: { min: 2_000_000_000, max: null },
    })
  })

  it('the magnitude word is CONSUMED, not left as unresolved litter', () => {
    const out = r('float under 1 million')
    expect(out.unresolved, `left over: ${JSON.stringify(out.unresolved)}`).toEqual([])
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the window -- three phrasings, one result', () => {
  const EXPECTED = { float: { min: null, max: 1_000_000 } }

  it('"float under 1m" (tight, worked before)', () => {
    expect(rangesOf('float under 1m')).toEqual(EXPECTED)
  })

  it('"under a float of 1m" (the phrasing a trader types)', () => {
    expect(rangesOf('under a float of 1m')).toEqual(EXPECTED)
  })

  it('"float of under 1m"', () => {
    expect(rangesOf('float of under 1m')).toEqual(EXPECTED)
  })

  it('all three agree, exactly', () => {
    const a = rangesOf('float under 1m')
    expect(rangesOf('under a float of 1m')).toEqual(a)
    expect(rangesOf('float of under 1m')).toEqual(a)
  })

  it('and none of them leaves the column word behind as a mistake', () => {
    for (const q of ['float under 1m', 'under a float of 1m', 'float of under 1m']) {
      expect(r(q).state.mistakeKeys, `"${q}" also applied a mistake`).toEqual([])
    }
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 a BARE column phrase keeps today behaviour', () => {
  // Measured on the 528 book at the current substring floor: "float" applies
  // the mistake. That is the vocabulary reading, and with no operator and no
  // value there is no filter reading to compete with it.
  it('"float" alone now OFFERS the mistake instead of applying it', () => {
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: bare "float" APPLIED the mistake
    // "Float or RVOL criteria not met". It reaches that name as a whole
    // word at the FRONT, covering a fifth of it, so no boundary rule could
    // ever have caught it. Below the coverage floor the resolver now ASKS.
    expect(r('float').state.mistakeKeys).toEqual([])
    expect(r('float').ambiguous.flatMap((a) => a.candidates)).toEqual([
      'Float or RVOL criteria not met',
    ])
  })

  it('and sets no range', () => {
    expect(rangesOf('float')).toEqual({})
  })

  it('and raises exactly ONE offer -- the reading it declined to act on', () => {
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: no ambiguity at all, because the
    // word simply applied. There is still nothing to choose BETWEEN; the
    // question being asked is whether the trader meant the mistake at all.
    expect(r('float').ambiguous).toHaveLength(1)
  })

  it('"stop" and "risk" likewise keep their vocabulary reading', () => {
    // REVERSED BY BEAT 152. WAS: each APPLIED one mistake by substring.
    // Both still REACH the vocabulary -- that is what this asserts -- but a
    // substring hit now offers instead of applying.
    // "stop" is a PREFIX of "Stop too wide / risk undefined" and is UNCHANGED
    // -- the prefix tier still applies for non-symbol kinds.
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: "stop" APPLIED by prefix while
    // "risk" offered by substring. "stop" is four characters of "Stop too wide
    // / risk undefined" -- under a sixth of it -- so it now asks as well. The
    // two words finally behave the same way, which is what a trader expects.
    expect(r('stop').state.mistakeKeys).toHaveLength(0)
    expect(r('stop').ambiguous).toHaveLength(1)
    // "risk" reaches the same name by SUBSTRING, and that tier still offers.
    expect(r('risk').state.mistakeKeys).toHaveLength(0)
    expect(r('risk').ambiguous).toHaveLength(1)
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 a comparator with NO value applies nothing', () => {
  it('"float under" sets no range', () => {
    expect(rangesOf('float under')).toEqual({})
  })

  it('and applies nothing at all -- no coerced number, no mistake', () => {
    const out = r('float under')
    expect(out.applied, `applied: ${out.applied.join(' | ')}`).toEqual([])
    expect(out.state).toEqual(emptyFilters())
  })

  it('and the text comes back named', () => {
    const joined = r('float under').unresolved.join(' ')
    expect(joined).toContain('float')
    expect(joined).toContain('under')
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 an EXACT vocabulary match beats a windowed column claim', () => {
  // Constructed: a book whose owner named a playbook "Float". Their word wins
  // -- the same law that lets a real ticker beat the filler list.
  const NAMED: ResolverVocabulary = {
    ...BOOK,
    playbooks: [...BOOK.playbooks, { id: 11, name: 'Float', tier: 'B' }],
  }

  it('the playbook named Float wins over the float column', () => {
    // REVERSED BY BEAT 152. WAS: the playbook APPLIED, beating the column claim.
    // The playbook still WINS the word -- that precedence is untouched -- but
    // the rest of the sentence goes unread, so the strict boundary discards.
    const out = r('float under 1m', NAMED)
    expect(
      out.state.playbookIds,
      'the user own playbook name was taken by a column claim',
    ).toEqual([])
  })

  it('and no float range is set in that book', () => {
    expect(rangesOf('float under 1m', NAMED).float).toBeUndefined()
  })

  it('while the SAME query on a book without that name sets the range', () => {
    expect(rangesOf('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 operator words', () => {
  it('"over" works as an operator when flanked by a column and a value', () => {
    expect(rangesOf('net over 100')).toEqual({ net_pnl: { min: 100, max: null } })
  })

  it('"below" likewise', () => {
    expect(rangesOf('float below 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('BARE "over" now OFFERS the vocabulary reading', () => {
    // REVERSED BY BEAT ONE HUNDRED EIGHTY-FOUR, measured by beat one
    // hundred eighty-two. WAS: "over" APPLIED a mistake by
    // prefix. An operator word that is a quarter of a mistake name is a
    // resemblance, not an instruction, and it is now offered.
    expect(r('over').state.mistakeKeys).toHaveLength(0)
    expect(r('over').ambiguous).toHaveLength(1)
  })

  it('BARE "below" likewise', () => {
    // REVERSED BY BEAT 152. WAS: APPLIED one mistake by substring; now offered.
    expect(r('below').state.mistakeKeys).toHaveLength(0)
    expect(r('below').ambiguous).toHaveLength(1)
  })

  it('"float at least 1m" -- the two-word operator', () => {
    expect(rangesOf('float at least 1m')).toEqual({ float: { min: 1_000_000, max: null } })
  })

  it('"float at most 1m"', () => {
    expect(rangesOf('float at most 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"at" inside an operator phrase raises NO ticker ambiguity', () => {
    const out = r('float at least 1m')
    expect(
      out.ambiguous,
      `"at" still offered tickers: ${JSON.stringify(out.ambiguous)}`,
    ).toEqual([])
  })

  it('but BARE "at" keeps its ambiguity, unchanged', () => {
    // REVERSED BY BEAT 152. WAS: 'at' offered ATRA and ATPC by two-character prefix.
    // At the new symbol floor of three it reaches neither, so there is no
    // ambiguity left to report and the word comes back unread.
    expect(r('at').ambiguous).toEqual([])
    expect(r('at').unresolved).toContain('at')
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 the full sentence', () => {
  const Q = 'show me trades with float under 1 million'

  it('applies exactly ONE range', () => {
    expect(rangesOf(Q)).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('and exactly one thing overall', () => {
    expect(r(Q).applied).toHaveLength(1)
  })

  it('with no mistake stolen from the column word', () => {
    expect(r(Q).state.mistakeKeys).toEqual([])
  })

  it('and nothing left unresolved -- every word was filler or used', () => {
    expect(r(Q).unresolved).toEqual([])
  })
})

// --- G8 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G8 every tight form that works today still works', () => {
  it('"float under 1m"', () => {
    expect(rangesOf('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"float below 1m"', () => {
    expect(rangesOf('float below 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"net over 100"', () => {
    expect(rangesOf('net over 100')).toEqual({ net_pnl: { min: 100, max: null } })
  })

  it('"rvol over 5x" -- the suffix that owns its column', () => {
    expect(rangesOf('rvol over 5x')).toEqual({ rvol: { min: 5, max: null } })
  })

  it('"market cap under 500m" -- the two-word column phrase', () => {
    expect(rangesOf('market cap under 500m')).toEqual({
      market_cap: { min: null, max: 500_000_000 },
    })
  })

  it('a bare money comparison with an outcome still carries the sign (G4 of the module)', () => {
    expect(r('losers over 100').state.ranges).toEqual({ net_pnl: { min: null, max: -100 } })
  })
})

// --- G9 ---------------------------------------------------------------------

describe('G9 the previous beat still holds', () => {
  it('the campaign sentence applies exactly outcome losers and region China', () => {
    // REVERSED BY BEAT 152. WAS: outcome losers and region China APPLIED.
    // The campaign sentence still carries words the resolver cannot read, and
    // this beat rules that a half-read sentence applies nothing at all.
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('all')
    expect(out.state.regions).toEqual([])
    // v0.2.7 — THREE now, not two: the limit beat taught the resolver that
    // "the 10" in this sentence is a row count. The sentence has said it all
    // along and it was unresolved until then.
    // v0.2.7 — FOUR now: the exclusion beat turned "but not from hong kong"
    // from an ignored phrase into an applied EXCLUSION. The sentence has meant
    // that from the first beat of the campaign; it is the last piece to land.
    // REVERSED BY BEAT 152. WAS: four applied lines. A discarded ask reports
    // nothing as applied, because nothing was.
    expect(out.applied).toHaveLength(0)
    // REVERSED BY BEAT 152. WAS: a limit of ten survived. Nothing does.
    expect(out.state.limit).toBe(null)
  })

  it('with nothing ambiguous', () => {
    expect(r(CAMPAIGN).ambiguous).toEqual([])
  })

  // v0.2.7 — INVERTED IN PLACE, not deleted. The negation beat made this
  // REFUSE because the ask had no shape for an exclusion; this beat gave it
  // one, so the same phrase now EXCLUDES. What the guard protects is unchanged
  // -- the negated term must never be applied POSITIVELY -- and that half is
  // asserted explicitly below.
  it('negation now EXCLUDES rather than refusing', () => {
    const out = r('not china')
    expect(out.state.excludeRegions).toEqual(['China'])
    expect(out.state.regions, 'the negated term was applied positively').toEqual([])
  })
})

// v0.2.7 — NUMBERS THE WAY PEOPLE SAY THEM.
//
// The value parser understood two forms: a bare number and a glued suffix.
// Everything else a trader actually types missed -- thousands separators, a
// spelled number, a unit word, a two-sided range. The previous beat taught the
// parser "million"; this one teaches it the rest, through the SAME path, so
// the spoken and the glued forms cannot disagree about what a number is.
//
// THE RULINGS these guards enforce:
//   ONE value parser. Every form extends the one the comparator beat built. A
//     second number path would let "1m" and "one million" drift apart.
//   An unparseable or genuinely AMBIGUOUS form is UNRESOLVED, never coerced.
//     "1,5" is a decimal comma in half the world and a broken thousands group
//     in the other half. The resolver does not get to pick: a wrong number
//     that runs is worse than a sentence that says it was not understood.
//   An EXACT vocabulary match still wins over a number word, and the word is
//     handed BACK rather than merely released -- the lesson from the beat
//     where dropping the claim still consumed the token.
//   Two-sided ranges fill min AND max on the EXISTING range field. The ask
//     does not grow.
//   The magnitude-of-loss law is untouched.
//
// STEP ZERO, measured before any of this was written: of the twenty-seven
// number words this beat teaches -- one through twenty, hundred, dollars,
// bucks, shares, percent, between, half -- ZERO collide with the five hundred
// and twenty-eight-trade book's vocabulary. No ticker, playbook, mistake or
// catalyst is named like a number. The exact-wins guard below is therefore
// CONSTRUCTED rather than observed, which is the honest way to guard a law
// that has no live example yet.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters } from '../tradesFilter'

const NOW = new Date('2026-08-22T15:00:00')

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
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)
const ranges = (q: string, vocab: ResolverVocabulary = BOOK) => r(q, vocab).state.ranges

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 thousands separators', () => {
  it('all three spellings of one million produce an IDENTICAL ask', () => {
    const glued = ranges('float under 1m')
    expect(ranges('float under 1,000,000'), 'the comma form disagrees').toEqual(glued)
    expect(ranges('float under 1 million'), 'the spoken form disagrees').toEqual(glued)
  })

  it('and that ask is one million', () => {
    expect(ranges('float under 1,000,000')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('a shorter group works too', () => {
    expect(ranges('float under 500,000')).toEqual({ float: { min: null, max: 500_000 } })
  })

  it('nothing is left over as unresolved litter', () => {
    expect(r('float under 1,000,000').unresolved).toEqual([])
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the dollar sign', () => {
  it('"$10" parses as ten', () => {
    expect(ranges('net over $10')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"$1.5m" parses as one and a half million', () => {
    expect(ranges('market cap under $1.5m')).toEqual({
      market_cap: { min: null, max: 1_500_000 },
    })
  })

  it('a bare "$" is NOT a number', () => {
    const out = r('net over $')
    expect(out.state.ranges).toEqual({})
    expect(out.applied).toEqual([])
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 spelled numbers', () => {
  it('"float under one million"', () => {
    expect(ranges('float under one million')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('"net over ten"', () => {
    expect(ranges('net over ten')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"float over five hundred thousand"', () => {
    expect(ranges('float over five hundred thousand')).toEqual({
      float: { min: 500_000, max: null },
    })
  })

  it('"float under half a million" is five hundred thousand', () => {
    expect(ranges('float under half a million')).toEqual({
      float: { min: null, max: 500_000 },
    })
  })

  it('"net over twenty"', () => {
    expect(ranges('net over twenty')).toEqual({ net_pnl: { min: 20, max: null } })
  })

  it('the spelled form and the digit form agree exactly', () => {
    expect(ranges('float under one million')).toEqual(ranges('float under 1000000'))
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 unit words', () => {
  it('"net over ten dollars" reads the value as ten', () => {
    expect(ranges('net over ten dollars')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"net over ten bucks" likewise', () => {
    expect(ranges('net over ten bucks')).toEqual({ net_pnl: { min: 10, max: null } })
  })

  it('"gain over fifty percent" equals "gain over 50%"', () => {
    expect(ranges('gain over fifty percent')).toEqual(ranges('gain over 50%'))
  })

  it('and that is fifty', () => {
    expect(ranges('gain over fifty percent')).toEqual({
      pnl_gain_pct: { min: 50, max: null },
    })
  })

  it('a unit word with NO number is unresolved', () => {
    const out = r('net over dollars')
    expect(out.state.ranges).toEqual({})
    expect(out.applied).toEqual([])
    expect(out.unresolved.join(' ')).toContain('dollars')
  })

  it('the unit word is consumed, not left as litter', () => {
    expect(r('net over ten dollars').unresolved).toEqual([])
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 two-sided ranges', () => {
  it('"float between 1m and 5m" fills min AND max on ONE range', () => {
    expect(ranges('float between 1m and 5m')).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('"float 1m to 5m" is the same ask', () => {
    expect(ranges('float 1m to 5m')).toEqual(ranges('float between 1m and 5m'))
  })

  it('the spoken form works too', () => {
    expect(ranges('float between one and five million')).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('a "between" with ONE operand is UNRESOLVED, never a one-sided filter', () => {
    const out = r('float between 1m')
    expect(
      out.state.ranges,
      'half a range was shipped as if it were whole',
    ).toEqual({})
    expect(out.applied).toEqual([])
  })

  it('and the ask gains no new field -- it is the existing ranges map', () => {
    const out = r('float between 1m and 5m')
    expect(Object.keys(out.state)).toEqual(Object.keys(emptyFilters()))
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 an ambiguous numeric form is never coerced', () => {
  it('"1,5" is unresolved -- decimal comma or broken group, and it does not pick', () => {
    const out = r('float under 1,5')
    expect(
      out.state,
      'an ambiguous number was coerced into a filter',
    ).toEqual(emptyFilters())
  })

  it('"1,00,000" is unresolved -- not a valid thousands grouping', () => {
    expect(r('float under 1,00,000').state).toEqual(emptyFilters())
  })

  it('neither applies anything at all', () => {
    expect(r('float under 1,5').applied).toEqual([])
    expect(r('float under 1,00,000').applied).toEqual([])
  })

  it('and the text comes back named rather than vanishing', () => {
    expect(r('float under 1,5').unresolved.join(' ')).toContain('1,5')
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 an EXACT vocabulary match wins over a number word', () => {
  // CONSTRUCTED: step zero found no such collision on the real book, so the
  // law is guarded against a fixture rather than left untested until a user
  // names a setup "Ten".
  const NAMED: ResolverVocabulary = {
    ...BOOK,
    symbols: [...BOOK.symbols, 'TEN'],
  }

  it('the ticker named TEN keeps the word', () => {
    expect(r('net over ten', NAMED).state.symbol).toBe('TEN')
  })

  it('and no range is built from it', () => {
    expect(ranges('net over ten', NAMED).net_pnl).toBeUndefined()
  })

  it('while the same query on a book without that ticker reads the number', () => {
    expect(ranges('net over ten')).toEqual({ net_pnl: { min: 10, max: null } })
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 the magnitude-of-loss law is unchanged', () => {
  it('"losers over 100" is net BELOW minus one hundred', () => {
    expect(r('losers over 100').state.ranges).toEqual({
      net_pnl: { min: null, max: -100 },
    })
  })

  it('"winners over 100" is net above plus one hundred', () => {
    expect(r('winners over 100').state.ranges).toEqual({
      net_pnl: { min: 100, max: null },
    })
  })

  it('and it holds for a SPELLED number too -- the new forms inherit the law', () => {
    expect(r('losers over one hundred').state.ranges).toEqual({
      net_pnl: { min: null, max: -100 },
    })
  })

  it('a bare money comparison with no outcome is still unresolved', () => {
    const out = r('over 100')
    expect(out.state.ranges).toEqual({})
    expect(out.unresolved.length).toBeGreaterThan(0)
  })
})

// --- G9 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G9 every form that works today still works', () => {
  it('"float under 1m"', () => {
    expect(ranges('float under 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('"float under 1 million"', () => {
    expect(ranges('float under 1 million')).toEqual({
      float: { min: null, max: 1_000_000 },
    })
  })

  it('"rvol over 5x"', () => {
    expect(ranges('rvol over 5x')).toEqual({ rvol: { min: 5, max: null } })
  })

  it('"gain over 50%"', () => {
    expect(ranges('gain over 50%')).toEqual({ pnl_gain_pct: { min: 50, max: null } })
  })

  it('"market cap under 500m"', () => {
    expect(ranges('market cap under 500m')).toEqual({
      market_cap: { min: null, max: 500_000_000 },
    })
  })

  it('"under a float of 1m" -- the window still holds', () => {
    expect(ranges('under a float of 1m')).toEqual({ float: { min: null, max: 1_000_000 } })
  })

  it('bare "float" still keeps its vocabulary reading', () => {
    expect(r('float').state.mistakeKeys).toHaveLength(1)
    expect(r('float').state.ranges).toEqual({})
  })

  it('the campaign sentence is unchanged', () => {
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('losers')
    expect(out.state.regions).toEqual(['China'])
    // v0.2.7 — THREE now, not two: the limit beat taught the resolver that
    // "the 10" in this sentence is a row count. The sentence has said it all
    // along and it was unresolved until then.
    // v0.2.7 — FOUR now: the exclusion beat turned "but not from hong kong"
    // from an ignored phrase into an applied EXCLUSION. The sentence has meant
    // that from the first beat of the campaign; it is the last piece to land.
    expect(out.applied).toHaveLength(4)
    expect(out.state.limit).toBe(10)
    expect(out.ambiguous).toEqual([])
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

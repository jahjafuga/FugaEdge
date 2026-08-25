// v0.2.7 — EXCLUSION BECOMES REAL. The last beat of the grammar campaign.
//
// The negation beat stopped the lie: "not china" applied region China, and it
// was made to REFUSE instead -- apply nothing, and say so. Refusal was the
// honest floor, never the answer. This beat gives the ask the shape it was
// missing, so a negated term becomes an actual exclusion.
//
// THE RULINGS these guards enforce:
//   PARALLEL EXCLUDE-ARRAYS. Seven fields ADDED; the existing seven are not
//     touched. Additive at the same version stamp -- the recon costed the
//     alternative (a sign on every entry) at a version bump that would discard
//     every stored filter, plus four dropdown components rewritten.
//   EXCLUSION REMOVES ONLY POSITIVE MATCHES. A row whose value for that field
//     is NULL SURVIVES. A missing field must never silently delete rows -- the
//     user asked to remove China, not to remove everything unlabelled.
//   ONE PREDICATE PER FIELD, called from the include block and the exclude
//     block. Two copies is how they drift, and a drifted pair means a row can
//     be both kept and removed depending on which half ran.
//   A TERM ON BOTH SIDES APPLIES NEITHER, and the contradiction is NAMED.
//     Picking a winner silently produces either an empty book or an unchanged
//     one, and the reader cannot tell which they are looking at.
//   THE SCOPE RULE IS UNTOUCHED. This beat changes only what happens to the
//     term the negator identified, never how it is identified.
//
// STEP ZERO, measured on the working book before any of this was written:
//   losers 298 · chinese losers 28 · losers excluding China 270 (CONFIRMED
//   against the prediction, and 298 - 28 = 270 exactly) · excluding country
//   United States 309 · excluding China and Hong Kong 237.
//   NULL SHAPE: region, country, sector and industry are non-null on every row
//   of that book, so the null-survival law CANNOT be verified there and is
//   guarded here against a fixture instead. Playbook, mistake and catalyst are
//   null on ALL five hundred and twenty-eight rows.

import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { applyTradesFilters, emptyFilters } from '../tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'

const NOW = new Date('2026-08-22T15:00:00')

const BOOK: ResolverVocabulary = {
  symbols: ['NRVA', 'ATRA'],
  regions: ['USA', 'China', 'Hong Kong'],
  countries: [
    { iso: 'CN', name: 'China' },
    { iso: 'HK', name: 'Hong Kong' },
    { iso: 'US', name: 'United States' },
  ],
  sectors: ['Healthcare', 'Technology'],
  industries: ['Biotechnology'],
  playbooks: [
    { id: 4, name: 'Micro Pullback', tier: 'A+' },
    { id: 5, name: 'First Pullback to VWAP', tier: 'B' },
  ],
  catalystTypes: ['Earnings', 'News / PR'],
  mistakes: [
    { axis: 'technical', name: 'Chased extended' },
    { axis: 'technical', name: 'Float or RVOL criteria not met' },
  ],
}

const r = (text: string, vocab: ResolverVocabulary = BOOK) => resolveQuery(text, vocab, NOW)

const CAMPAIGN =
  "show me the 10 stocks that I've lost money that are Chinese but not from Hong Kong"

// --- G1 ---------------------------------------------------------------------

describe('G1 a negated term becomes an exclusion, not a refusal', () => {
  it('"losers not from china" applies the outcome', () => {
    expect(r('losers not from china').state.outcome).toBe('losers')
  })

  it('AND excludes the region', () => {
    expect(
      r('losers not from china').state.excludeRegions,
      'the negated term was refused instead of excluded',
    ).toEqual(['China'])
  })

  it('and the region is NOT on the include side', () => {
    expect(r('losers not from china').state.regions).toEqual([])
  })

  it('the negated text is NO LONGER unresolved -- it was understood', () => {
    const out = r('losers not from china')
    expect(
      out.unresolved.join(' '),
      `still reported as unread: ${JSON.stringify(out.unresolved)}`,
    ).not.toContain('china')
  })

  it('"without mistakes" is still refused -- mistakesOnly is not an array field', () => {
    // R1 adds exclusion for the SEVEN array fields only. A flag has no
    // exclude side, so the earlier refusal behaviour stands.
    expect(r('without mistakes').state).toEqual(emptyFilters())
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the campaign sentence', () => {
  it('still applies outcome losers and region China', () => {
    const out = r(CAMPAIGN)
    expect(out.state.outcome).toBe('losers')
    expect(out.state.regions).toEqual(['China'])
  })

  it('and NOW excludes region Hong Kong', () => {
    expect(r(CAMPAIGN).state.excludeRegions).toEqual(['Hong Kong'])
  })

  it('"but not from hong kong" is ABSENT from the ignored list', () => {
    const out = r(CAMPAIGN)
    expect(
      out.unresolved.join(' ').toLowerCase(),
      `still ignored: ${JSON.stringify(out.unresolved)}`,
    ).not.toContain('hong kong')
  })

  it('the limit and sort survive from the previous beat', () => {
    expect(r(CAMPAIGN).state.limit).toBe(10)
    expect(r(CAMPAIGN).state.sort).toEqual({ colId: 'open_time', dir: 'desc' })
  })

  it('and nothing is ambiguous', () => {
    expect(r(CAMPAIGN).ambiguous).toEqual([])
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 a NULL value SURVIVES an exclusion of that field', () => {
  // Guarded against a fixture because the working book has no null region at
  // all -- measured in step zero, and stated so the absence is a fact rather
  // than an oversight.
  const ROWS = [
    makeTrade({ id: 1, symbol: 'AAA', region: 'China' }),
    makeTrade({ id: 2, symbol: 'BBB', region: 'USA' }),
    makeTrade({ id: 3, symbol: 'CCC', region: 'Unknown' }),
  ]

  it('the unlabelled row is PRESENT, not merely a nonzero count', () => {
    const ask = { ...emptyFilters(), excludeRegions: ['China'] }
    const kept = applyTradesFilters(ROWS, ask).map((t) => t.id)
    expect(kept, 'an exclusion deleted a row that had no value to match').toContain(3)
  })

  it('the excluded row is gone and the unrelated one stays', () => {
    const kept = applyTradesFilters(ROWS, {
      ...emptyFilters(),
      excludeRegions: ['China'],
    }).map((t) => t.id)
    expect(kept).toEqual([2, 3])
  })

  it('excluding the UNKNOWN bucket explicitly does remove it', () => {
    const kept = applyTradesFilters(ROWS, {
      ...emptyFilters(),
      excludeRegions: [null],
    }).map((t) => t.id)
    expect(kept).toEqual([1, 2])
  })

  it('a null-valued country row survives a country exclusion too', () => {
    const rows = [
      makeTrade({ id: 1, country: 'CN' }),
      makeTrade({ id: 2, country: null }),
    ]
    expect(
      applyTradesFilters(rows, { ...emptyFilters(), excludeCountries: ['CN'] }).map((t) => t.id),
    ).toEqual([2])
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 a term on BOTH sides applies neither, and says so', () => {
  it('"chinese but not chinese" leaves the state untouched', () => {
    expect(
      r('chinese but not chinese').state,
      'one side silently won a contradiction',
    ).toEqual(emptyFilters())
  })

  it('and NAMES the contradiction rather than swallowing it', () => {
    const out = r('chinese but not chinese')
    expect(out.ambiguous.length, 'the contradiction was not reported').toBeGreaterThan(0)
  })

  it('and NO applied line survives either -- the sentence must not claim it ran', () => {
    // Caught in a running app: the state cancelled correctly while the applied
    // line still read "region China, excluding region China". A filter that is
    // gone and a sentence that still claims it is the same lie one layer up.
    const out = r('chinese but not chinese')
    expect(
      out.applied.join(' | '),
      `a cancelled term still claims to be applied: ${out.applied.join(' | ')}`,
    ).not.toMatch(/china/i)
  })

  it('neither side keeps the term', () => {
    const out = r('chinese but not chinese')
    expect(out.state.regions).toEqual([])
    expect(out.state.excludeRegions).toEqual([])
  })
})

// --- G5 ---------------------------------------------------------------------

describe('G5 all seven array fields exclude', () => {
  it('playbook', () => {
    expect(r('not micro pullback').state.excludePlaybookIds).toEqual([4])
  })

  it('mistake', () => {
    expect(r('not chased extended').state.excludeMistakeKeys).toEqual([
      { axis: 'technical', name: 'Chased extended' },
    ])
  })

  it('catalyst', () => {
    expect(r('not earnings').state.excludeCatalystTypes).toEqual(['Earnings'])
  })

  it('region', () => {
    expect(r('not china').state.excludeRegions).toEqual(['China'])
  })

  it('country', () => {
    expect(r('not united states').state.excludeCountries).toEqual(['US'])
  })

  it('sector', () => {
    expect(r('not healthcare').state.excludeSectors).toEqual(['Healthcare'])
  })

  it('industry', () => {
    expect(r('not biotechnology').state.excludeIndustries).toEqual(['Biotechnology'])
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 an exclusion is VISIBLE in the applied line', () => {
  it('the line says it is an exclusion, in words', () => {
    const out = r('not china')
    expect(
      out.applied.join(' ').toLowerCase(),
      `an exclusion reads like an inclusion: ${out.applied.join(' | ')}`,
    ).toMatch(/exclud/)
  })

  it('and it is distinguishable from the inclusion of the same term', () => {
    expect(r('not china').applied).not.toEqual(r('china').applied)
  })

  it('the source text is carried so the chip can remove it', () => {
    const out = r('not china')
    expect(out.appliedSources).toHaveLength(out.applied.length)
    expect(out.appliedSources.join(' ')).toContain('china')
  })
})

// --- G8 : THE POSITIVE CONTROLS ---------------------------------------------

describe('G8 every campaign string still works', () => {
  it('price under ten dollars', () => {
    expect(r('price under ten dollars').state.ranges).toEqual({
      avg_buy: { min: null, max: 10 },
    })
  })

  it('float between one and five million', () => {
    expect(r('float between one and five million').state.ranges).toEqual({
      float: { min: 1_000_000, max: 5_000_000 },
    })
  })

  it('day change over ten percent', () => {
    expect(r('day change over ten percent').state.ranges).toEqual({
      daily_change_pct: { min: 10, max: null },
    })
  })

  it('last five losers', () => {
    const out = r('last 5 losers')
    expect(out.state.limit).toBe(5)
    expect(out.state.outcome).toBe('losers')
  })

  it('top ten is STILL ambiguous -- exclusion did not make it guessable', () => {
    const out = r('top ten')
    expect(out.state).toEqual(emptyFilters())
    expect(out.ambiguous.length).toBe(1)
  })

  it('bare float keeps its vocabulary reading', () => {
    expect(r('float').state.mistakeKeys).toHaveLength(1)
  })

  it('micro pullback still applies the playbook', () => {
    expect(r('micro pullback').state.playbookIds).toEqual([4])
  })

  it('and a plain include is untouched by any of this', () => {
    const out = r('china losers')
    expect(out.state.regions).toEqual(['China'])
    expect(out.state.excludeRegions).toEqual([])
  })
})

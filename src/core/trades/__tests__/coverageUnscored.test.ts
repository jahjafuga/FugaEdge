import { describe, expect, it } from 'vitest'
import { countDroppedUnmeasured, COVERAGE_WORDS } from '@/core/trades/numericRange'
import {
  applyTradesFilters,
  countUnscoredDropped,
  coverageFor,
  emptyFilters,
  rangeValueOf,
  SCORE_CEILING,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import { responseLine } from '@/core/trades/queryResponse'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

// WHAT THIS FILE IS FOR.
//
// A score bound DROPS every row nobody scored, and said nothing about it. The
// range machinery has answered exactly this question since it was built --
// countDroppedUnmeasured, from the rows BEFORE the filter ran, because the
// dropped rows are gone by the time anything downstream holds a result -- but
// the score is not a numeric column and could not use it.
//
// ONE NUMBER, NOT TWO. A row can be unscored two ways: the dna field is
// absent because it was never augmented, or dna.kind is 'incomplete' because
// the inputs were missing. tradesFilter collapses both at
// `s.kind === 'scored' ? s : null`, so every bound treats them identically and
// a counter that reported them separately would be describing a distinction
// the filter cannot make.
//
// BOUNDS ONLY, NEVER THE BUCKET. Under `incomplete` the unscored rows ARE the
// answer. Counting them as a gap would report the result as a loss.

/** One row per attainable score, plus BOTH shapes of absence, plus some rows
 *  carrying unmeasured numeric columns so the two counters can be seen not to
 *  interfere. */
const BOOK: TradeListRow[] = [
  ...Array.from({ length: SCORE_CEILING + 1 }, (_, p) =>
    ({
      ...makeTrade({ id: p + 1, symbol: `S${p}` }),
      dna: { kind: 'scored', passed: p, of: SCORE_CEILING },
      rvol: p % 2 === 0 ? 3 : null,
      float: 5_000_000,
    }) as TradeListRow),
  // ABSENCE ONE: never augmented at all
  { ...makeTrade({ id: 90, symbol: 'NODNA' }), rvol: 3, float: null } as TradeListRow,
  // ABSENCE TWO: augmented, inputs missing
  {
    ...makeTrade({ id: 91, symbol: 'INCOMP' }),
    dna: { kind: 'incomplete', missing: ['rvol', 'float'] },
    rvol: null,
    float: 4_000_000,
  } as TradeListRow,
]

/** Every row IS scored. The counter must find nothing here. */
const ALL_SCORED: TradeListRow[] = Array.from({ length: 4 }, (_, p) =>
  ({
    ...makeTrade({ id: p + 1, symbol: `T${p}` }),
    dna: { kind: 'scored', passed: p, of: SCORE_CEILING },
  }) as TradeListRow)

const ask = (dna: Partial<TradesFilterState['dna']>, rest: Partial<TradesFilterState> = {}) =>
  ({
    ...emptyFilters(),
    ...rest,
    dna: { minScore: null, maxScore: null, bucket: 'any', ...dna },
  }) as TradesFilterState

const base = { count: 0, applied: [] as string[], unresolved: [] as string[], limit: null }

const line = (state: TradesFilterState, rows: TradeListRow[] = BOOK) => {
  const kept = applyTradesFilters(rows, state)
  return responseLine({
    ...base,
    count: kept.length,
    applied: ['the ask'],
    coverage: [
      ...(countDroppedUnmeasured(rows, state.ranges ?? {}, rangeValueOf) ?? []),
      ...(countUnscoredDropped(rows, state.dna) ?? []),
    ],
  })
}

describe('P the unscored rows a score bound drops are counted and named', () => {
  it('P1 a FLOOR names the unscored count in its sentence', () => {
    const said = line(ask({ minScore: 3 }))
    expect(said, 'the sentence says nothing about the rows it dropped').toContain('2 with no')
    expect(said).toContain(COVERAGE_WORDS.dna)
  })

  it('P2 a CEILING names it too', () => {
    const said = line(ask({ maxScore: 3 }))
    expect(said).toContain('2 with no')
    expect(said).toContain(COVERAGE_WORDS.dna)
  })

  it('P3 the count is the PRE-filter number, not what survived', () => {
    // THE WHOLE DESIGN, and it is why numericRange:56 takes the rows before
    // the filter ran. Every unscored row is GONE from the result, so counting
    // among survivors can only ever return zero.
    const got = countUnscoredDropped(BOOK, ask({ minScore: 3 }).dna)
    expect(got, 'no entry was produced at all').not.toBeNull()
    expect(got![0].skipped, 'the count was taken from the survivors').toBe(2)
    const kept = applyTradesFilters(BOOK, ask({ minScore: 3 }))
    expect(countUnscoredDropped(kept, ask({ minScore: 3 }).dna)![0].skipped,
      'the post-filter population is not zero, so the pre-filter one proves nothing').toBe(0)
  })

  it('P4 a fully scored book produces NO entry', () => {
    // A zero SKIP is still reported -- "fully covered" must be tellable from
    // "not asked" -- so this asserts the shape, not the absence of the entry.
    const got = countUnscoredDropped(ALL_SCORED, ask({ minScore: 2 }).dna)
    expect(got).not.toBeNull()
    expect(got![0].skipped, 'a fully scored book reported a gap').toBe(0)
    expect(line(ask({ minScore: 2 }), ALL_SCORED)).not.toContain('with no')
  })

  it('P5 the BUCKET is not a coverage gap', () => {
    // Under `incomplete` the unscored rows ARE the answer. Reporting them as
    // dropped would describe the result as a loss.
    expect(countUnscoredDropped(BOOK, ask({ bucket: 'incomplete' }).dna)).toBeNull()
    expect(countUnscoredDropped(BOOK, ask({ bucket: 'complete' }).dna)).toBeNull()
    expect(line(ask({ bucket: 'incomplete' }))).not.toContain('with no')
  })

  it('P6 REGRESSION CONTROL: one range and no score bound keeps the unnamed form', () => {
    // coverageNaming.test.ts:202 asserts this byte for byte. The dna entry
    // must not exist when no bound was asked for, or every single-range
    // sentence in the app changes shape.
    const said = line(ask({}, { ranges: { rvol: { min: 2, max: null } } }))
    expect(said, 'the single-range sentence changed shape').toContain(', and 4 never measured')
    expect(said).not.toContain('relative volume recorded')
  })

  it('P7 a range PLUS a score bound names BOTH, range first', () => {
    const said = line(ask({ minScore: 3 }, { ranges: { rvol: { min: 2, max: null } } }))
    expect(said).toContain('with no relative volume recorded')
    expect(said).toContain(COVERAGE_WORDS.dna)
    expect(
      said.indexOf('relative volume recorded'),
      'the score was named before the range that was typed first',
    ).toBeLessThan(said.indexOf(COVERAGE_WORDS.dna))
  })

  it('P8 BOTH absence shapes count, as ONE number', () => {
    // The filter cannot tell them apart, so neither may the sentence.
    const got = countUnscoredDropped(BOOK, ask({ minScore: 3 }).dna)!
    expect(got.length, 'the two absences were reported separately').toBe(1)
    expect(got[0].skipped, 'one of the two absence shapes went uncounted').toBe(2)
  })

  it('P10 the COMPOSED clause takes the pre-filter rows, and names both', () => {
    // FOUND BY A PLANT THAT REDDENED NOTHING. Swapping the population for the
    // post-filter rows changed no test at all, because the composition lived
    // in the page and nothing drives the page. It lives in core now, and this
    // is the case that watches it.
    //
    // BOTH DIRECTIONS ARE ASSERTED: the pre-filter number is what it should
    // be AND the post-filter number is different. Without the second half a
    // book where the two happened to agree would make this vacuous.
    const state = ask({ minScore: 3 }, { ranges: { rvol: { min: 2, max: null } } })
    const pre = coverageFor(BOOK, state)!
    const post = coverageFor(applyTradesFilters(BOOK, state), state)!
    const dnaOf = (c: typeof pre) => c.find((x) => x.column === 'dna')!.skipped
    expect(dnaOf(pre), 'the composed clause counted the survivors').toBe(2)
    expect(dnaOf(post), 'pre and post agree, so this case proves nothing').toBe(0)
    // and the order the sentence depends on
    expect(pre.map((c) => c.column), 'the score was composed before the range').toEqual(['rvol', 'dna'])
  })

  it('P10b CONTROL: neither asked means null, not an empty array', () => {
    // A book nobody questioned must stay distinguishable from one fully
    // covered, which is the contract countDroppedUnmeasured already keeps.
    expect(coverageFor(BOOK, ask({}))).toBeNull()
  })

  it('P9 the count can never exceed the population it was taken from', () => {
    for (const n of [0, 1, 3, SCORE_CEILING]) {
      const got = countUnscoredDropped(BOOK, ask({ minScore: n }).dna)!
      expect(got[0].skipped).toBeLessThanOrEqual(BOOK.length)
      expect(got[0].skipped).toBeGreaterThanOrEqual(0)
    }
  })
})

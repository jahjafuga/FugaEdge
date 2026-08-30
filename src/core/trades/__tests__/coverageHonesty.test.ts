import { describe, expect, it } from 'vitest'
import { countDroppedUnmeasured } from '@/core/trades/numericRange'
import {
  countUnmeasuredKept,
  emptyFilters,
  rangeValueOf,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import { responseLine } from '@/core/trades/queryResponse'
import type { TradeListRow } from '@shared/trades-types'

// WHAT THIS FILE IS FOR.
//
// A range and an exclusion do OPPOSITE things to a row nobody measured. The
// range DROPS it: numericRange.ts, the null rule, puts it in neither the over
// set nor the under set. The exclusion KEEPS it: the shared predicate asks
// "does this row POSITIVELY match", and a row with no value matches nothing,
// so it survives.
//
// That single difference is why there are TWO counters and not one. It also
// decides WHERE each count can be taken. The range's dropped rows are gone by
// the time anything downstream sees the result, so its count must come from
// the rows BEFORE the filter ran. The exclusion's unmeasured rows are still in
// the result, so its count comes from the rows the caller already holds.
//
// Beat one hundred eighty eight built one counter, fed it the surviving rows,
// and it returned zero on every one of five thousand one hundred and eighty
// eight driven asks -- because it was looking for rows the filter had already
// removed. These guards exist so that cannot come back.

const base = {
  count: 100,
  applied: ['float at least 1000000'],
  unresolved: [] as string[],
}

/** A row carrying only what these guards read. */
const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow

const rows = (n: number, make: (i: number) => Partial<TradeListRow>) =>
  Array.from({ length: n }, (_, i) => row(make(i)))

describe('CH1 a range on a PARTIALLY covered column names what it dropped', () => {
  it('the sentence carries the count', () => {
    const line = responseLine({ ...base, coverage: { skipped: 23, column: 'float' } })
    expect(line).toContain('23')
    expect(line).toContain('never measured')
  })
  it('and the counter derives that count from the PRE-filter rows', () => {
    // Twenty three of these have no value at all. After a range ran, they
    // would not be here to count -- which is the whole point.
    const pre = rows(140, (i) => ({ float_shares: i < 23 ? null : 5_000_000 }))
    const got = countDroppedUnmeasured(
      pre,
      { float: { min: 1_000_000, max: null } },
      rangeValueOf,
    )
    expect(got).not.toBeNull()
    expect(got!.skipped).toBe(23)
    expect(got!.column).toBe('float')
  })
})

describe('CH2 a range on a FULLY covered column says NOTHING -- the control', () => {
  it('the counter returns zero', () => {
    const pre = rows(140, () => ({ float_shares: 5_000_000 }))
    const got = countDroppedUnmeasured(
      pre,
      { float: { min: 1_000_000, max: null } },
      rangeValueOf,
    )
    expect(got!.skipped).toBe(0)
  })
  it('and a zero count produces no clause at all', () => {
    const line = responseLine({ ...base, coverage: { skipped: 0, column: 'float' } })
    expect(line).not.toContain('never measured')
  })
  it('and no range at all produces no clause either', () => {
    const pre = rows(10, () => ({ float_shares: null }))
    expect(countDroppedUnmeasured(pre, {}, rangeValueOf)).toBeNull()
    expect(responseLine({ ...base, coverage: null })).not.toContain('never measured')
  })
})

describe('CH3 a range on a FULLY NULL column names every row', () => {
  it('all five hundred and twenty eight are reported, not silently dropped', () => {
    const pre = rows(528, () => ({ mae: null }))
    const got = countDroppedUnmeasured(pre, { mae: { min: 1, max: null } }, rangeValueOf)
    expect(got!.skipped).toBe(528)
    const line = responseLine({
      count: 0,
      applied: ['mae at least 1'],
      unresolved: [],
      coverage: got,
    })
    expect(line).toContain('528')
    expect(line).toContain('never measured')
  })
})

describe('CH4 an exclusion on a SPARSE field names what it KEPT unmeasured', () => {
  it('the largest book keeps four hundred and forty five and says why', () => {
    // Four hundred and thirty nine were never computed and SURVIVED the
    // exclusion. Six are genuinely negative.
    const kept = [
      ...rows(439, () => ({ tf_1m_macd_positive: null })),
      ...rows(6, () => ({ tf_1m_macd_positive: false })),
    ]
    const st: TradesFilterState = { ...emptyFilters(), excludeMacdStates: ['positive'] }
    const got = countUnmeasuredKept(kept, st)
    expect(got).not.toBeNull()
    expect(got!.skipped).toBe(439)
    const line = responseLine({
      count: 445,
      applied: ['excluding macd positive (1-minute)'],
      unresolved: [],
      excluded: got,
    })
    expect(line).toContain('439')
    expect(line).toContain('never measured')
  })
})

describe('CH5 an exclusion on a FULLY covered field says NOTHING -- the control', () => {
  it('every kept row was measured, so the counter returns zero', () => {
    const kept = rows(94, () => ({ tf_1m_macd_positive: false }))
    const st: TradesFilterState = { ...emptyFilters(), excludeMacdStates: ['positive'] }
    expect(countUnmeasuredKept(kept, st)!.skipped).toBe(0)
    expect(
      responseLine({
        count: 94,
        applied: ['excluding macd positive (1-minute)'],
        unresolved: [],
        excluded: { skipped: 0, column: 'macd' },
      }),
    ).not.toContain('never measured')
  })
  it('and with no exclusion in force the counter declines to answer', () => {
    const kept = rows(94, () => ({ tf_1m_macd_positive: null }))
    expect(countUnmeasuredKept(kept, emptyFilters())).toBeNull()
  })
})

describe('CH6 the two counters are DIFFERENT and cannot stand in for each other', () => {
  // THE DISCRIMINATOR. One set of rows, one scenario, and the two counters
  // must disagree -- because a range would have thrown these rows away and an
  // exclusion kept them. If either function were substituted for the other,
  // one of these two numbers would be wrong.
  const mixed = [
    ...rows(439, () => ({ tf_1m_macd_positive: null, float_shares: null })),
    ...rows(6, () => ({ tf_1m_macd_positive: false, float_shares: 5_000_000 })),
  ]
  it('the RANGE counter reads the ranges map and knows nothing of exclusions', () => {
    const st: TradesFilterState = { ...emptyFilters(), excludeMacdStates: ['positive'] }
    // An exclusion is not a range, so a range counter has nothing to report.
    expect(countDroppedUnmeasured(mixed, st.ranges ?? {}, rangeValueOf)).toBeNull()
  })
  it('the EXCLUSION counter reads the exclusion arrays and knows nothing of ranges', () => {
    const st: TradesFilterState = {
      ...emptyFilters(),
      ranges: { float: { min: 1_000_000, max: null } },
    }
    // A range is not an exclusion, so an exclusion counter has nothing to say.
    expect(countUnmeasuredKept(mixed, st)).toBeNull()
  })
  it('and on the SAME rows they return different numbers when both apply', () => {
    const st: TradesFilterState = {
      ...emptyFilters(),
      excludeMacdStates: ['positive'],
      ranges: { float: { min: 1_000_000, max: null } },
    }
    const dropped = countDroppedUnmeasured(mixed, st.ranges ?? {}, rangeValueOf)
    const kept = countUnmeasuredKept(mixed, st)
    expect(dropped!.skipped).toBe(439)
    expect(kept!.skipped).toBe(439)
    // The counts coincide here only because the same rows are unmeasured on
    // both fields. What must NOT coincide is the COLUMN each one names, and
    // that is what a substitution would break.
    expect(dropped!.column).toBe('float')
    expect(kept!.column).toBe('macd')
    expect(dropped!.column).not.toBe(kept!.column)
  })
})

describe('CH7 NEITHER COUNTER MAY MOVE A ROW COUNT', () => {
  it('the count in the sentence is the count that was handed in', () => {
    // The counters return a number to SAY. They are never consulted about
    // which rows survive, and the sentence echoes the count it was given.
    for (const cov of [null, { skipped: 0, column: 'float' }, { skipped: 23, column: 'float' }]) {
      const line = responseLine({ ...base, count: 117, coverage: cov })
      expect(line, `the row count moved with coverage ${JSON.stringify(cov)}`).toContain('117')
    }
    for (const exc of [null, { skipped: 0, column: 'macd' }, { skipped: 439, column: 'macd' }]) {
      const line = responseLine({
        count: 445,
        applied: ['excluding macd positive (1-minute)'],
        unresolved: [],
        excluded: exc,
      })
      expect(line, `the row count moved with excluded ${JSON.stringify(exc)}`).toContain('445')
    }
  })
  it('and neither counter mutates the rows it is given', () => {
    const pre = rows(10, (i) => ({ float_shares: i < 3 ? null : 5_000_000 }))
    const before = pre.length
    countDroppedUnmeasured(pre, { float: { min: 1, max: null } }, rangeValueOf)
    countUnmeasuredKept(pre, { ...emptyFilters(), excludeMacdStates: ['positive'] })
    expect(pre.length).toBe(before)
  })
})

describe('CH8 the count MUST come from the rows before the filter ran', () => {
  // THE GAP THIS CLOSES. Plants one through three are witnessed by the guards
  // above. A fourth -- supplying the SURVIVING rows instead of the pre-filter
  // ones -- is the exact defect of beat one hundred eighty eight, and no unit
  // test could see it, because it lives in the page wiring rather than in a
  // pure function. What CAN be pinned here is WHY the supply matters: the two
  // row sets give different answers, and the post-filter one is always zero.
  it('the same range, counted after it ran, can only ever report zero', () => {
    const pre = rows(140, (i) => ({ float_shares: i < 23 ? null : 5_000_000 }))
    const ranges = { float: { min: 1_000_000, max: null } }

    const fromPre = countDroppedUnmeasured(pre, ranges, rangeValueOf)
    expect(fromPre!.skipped, 'the pre-filter rows still hold the unmeasured ones').toBe(23)

    // What the filter leaves behind: the null rule dropped all twenty three.
    const survivors = pre.filter((t) => {
      const v = rangeValueOf(t, 'float')
      return v != null && Number.isFinite(v) && v >= 1_000_000
    })
    const fromPost = countDroppedUnmeasured(survivors, ranges, rangeValueOf)
    expect(fromPost!.skipped, 'a range removes exactly the rows this counts').toBe(0)

    expect(
      fromPre!.skipped === fromPost!.skipped,
      'if these ever agreed, which row set the page supplies would not matter',
    ).toBe(false)
  })
})

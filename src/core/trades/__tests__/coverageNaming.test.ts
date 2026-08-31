import { describe, expect, it } from 'vitest'
import {
  countDroppedUnmeasured,
  COVERAGE_WORDS,
} from '@/core/trades/numericRange'
import {
  applyTradesFilters,
  emptyFilters,
  rangeValueOf,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import { responseLine } from '@/core/trades/queryResponse'
import { NUMERIC_COLUMN_IDS } from '@/lib/prefs/columns'
import type { TradeListRow } from '@shared/trades-types'

// WHAT THIS FILE IS FOR.
//
// countDroppedUnmeasured used to RETURN on the first active range. With two
// ranges in the ask it named one column and stayed silent about the other,
// and WHICH one it named depended on the order the trader happened to type
// them. Beat two hundred nine measured the two orders disagreeing; beat two
// hundred ten priced the fix and the founder ruled NAMED rather than SUMMED.
//
// SUMMED WAS REFUSED FOR A REASON, and it is worth writing down. Adding the
// per-column counts double counts any row missing BOTH columns, so the summed
// number is not a count of anything. On the largest book the two counts are
// three hundred sixty seven and seven, and a row missing both would be in
// both.
//
// WHERE THE NAMING STARTS. One active range needs no column word: the trader
// named exactly one range, so the count cannot refer to anything else, and
// that sentence is left byte identical. The naming begins at TWO, which is
// exactly where the reader stops being able to tell which column is meant.

/** A row carrying only what these guards read. */
const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow

const rows = (n: number, make: (i: number) => Partial<TradeListRow>) =>
  Array.from({ length: n }, (_, i) => row(make(i)))

const base = { count: 74, applied: ['rvol at least 2'], unresolved: [] as string[] }

/** Ten rows: three have no rvol, one has no float, and one of the three is
 *  ALSO the one with no float -- which is the row a summed count would have
 *  counted twice. */
const MIXED = rows(10, (i) => ({
  rvol: i < 3 ? null : 5,
  float_shares: i === 0 ? null : 1_000_000,
  avg_buy_price: 4,
}))

const ranged = (r: Record<string, { min: number | null; max: number | null }>) =>
  ({ ...emptyFilters(), ranges: r }) as TradesFilterState

describe('CN1 two active ranges name BOTH, each in its own column words', () => {
  it('the sentence carries both counts and both column words', () => {
    const cov = countDroppedUnmeasured(
      MIXED,
      { rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).toContain('3 with no relative volume recorded')
    expect(line).toContain('1 with no float recorded')
  })

  it('and it does NOT fall back to the old single-column wording', () => {
    const cov = countDroppedUnmeasured(
      MIXED,
      { rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).not.toContain('never measured')
  })

  it('and it does NOT sum them: three plus one is four, and four is wrong', () => {
    // The row with neither value is in both counts, so a sum counts it twice.
    const cov = countDroppedUnmeasured(
      MIXED,
      { rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).not.toContain('4 with no')
    expect(line).not.toContain('and 4 never measured')
  })
})

describe('CN2 the OTHER clause order names the same two columns', () => {
  it('both orders produce both clauses', () => {
    const a = countDroppedUnmeasured(
      MIXED,
      { rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } },
      rangeValueOf,
    )
    const b = countDroppedUnmeasured(
      MIXED,
      { float: { min: null, max: 20_000_000 }, rvol: { min: 2, max: null } },
      rangeValueOf,
    )
    const la = responseLine({ ...base, coverage: a })
    const lb = responseLine({ ...base, coverage: b })
    for (const line of [la, lb]) {
      expect(line).toContain('3 with no relative volume recorded')
      expect(line).toContain('1 with no float recorded')
    }
  })

  it('and each order names its own column FIRST, because that is what was typed', () => {
    const a = responseLine({
      ...base,
      coverage: countDroppedUnmeasured(
        MIXED,
        { rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } },
        rangeValueOf,
      ),
    })
    const b = responseLine({
      ...base,
      coverage: countDroppedUnmeasured(
        MIXED,
        { float: { min: null, max: 20_000_000 }, rvol: { min: 2, max: null } },
        rangeValueOf,
      ),
    })
    expect(a.indexOf('relative volume')).toBeLessThan(a.indexOf('float recorded'))
    expect(b.indexOf('float recorded')).toBeLessThan(b.indexOf('relative volume'))
  })
})

describe('CN3 a fully covered column is not mentioned', () => {
  it('THE CONTROL: one range, every row measured, and the sentence says nothing', () => {
    const cov = countDroppedUnmeasured(
      MIXED,
      { avg_buy: { min: null, max: 10 } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).not.toContain('never measured')
    expect(line).not.toContain('with no')
  })

  it('and a covered column alongside an uncovered one is still not mentioned', () => {
    const cov = countDroppedUnmeasured(
      MIXED,
      { avg_buy: { min: null, max: 10 }, rvol: { min: 2, max: null } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).toContain('3 with no relative volume recorded')
    expect(line).not.toContain('entry price')
  })

  it('a covered column FIRST does not silence the uncovered one behind it', () => {
    // This is the defect wearing its other face: the old early return took the
    // first active range, found nothing to report, and said nothing at all.
    const cov = countDroppedUnmeasured(
      MIXED,
      { avg_buy: { min: null, max: 10 }, float: { min: null, max: 20_000_000 } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).toContain('1 with no float recorded')
  })
})

describe('CN4 three active ranges name all three', () => {
  it('every column that dropped a row is named, in typed order', () => {
    const three = rows(10, (i) => ({
      rvol: i < 3 ? null : 5,
      float_shares: i < 2 ? null : 1_000_000,
      mae: i < 4 ? null : 1,
      avg_buy_price: 4,
    }))
    const cov = countDroppedUnmeasured(
      three,
      {
        rvol: { min: 2, max: null },
        float: { min: null, max: 20_000_000 },
        mae: { min: null, max: 100 },
      },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).toContain('3 with no relative volume recorded')
    expect(line).toContain('2 with no float recorded')
    expect(line).toContain('4 with no MAE recorded')
    expect(line.indexOf('relative volume')).toBeLessThan(line.indexOf('float recorded'))
    expect(line.indexOf('float recorded')).toBeLessThan(line.indexOf('MAE recorded'))
  })
})

describe('CN5 ONE active range keeps the sentence it has always had', () => {
  it('the single-column wording is byte identical to before this beat', () => {
    const cov = countDroppedUnmeasured(
      MIXED,
      { rvol: { min: 2, max: null } },
      rangeValueOf,
    )
    const line = responseLine({ ...base, coverage: cov })
    expect(line).toContain(', and 3 never measured')
    expect(line).not.toContain('relative volume')
  })

  it('and null still means the range was never asked for', () => {
    expect(countDroppedUnmeasured(MIXED, {}, rangeValueOf)).toBeNull()
  })
})

describe('CN6 the ROW COUNT does not move, in any of these cases', () => {
  // R300. The coverage clause is a sentence and nothing else, so every one of
  // these asks must return exactly the rows it returned before. Twinned by
  // running the real filter over the same rows in both clause orders.
  const cases: [string, TradesFilterState, TradesFilterState][] = [
    [
      'rvol and float',
      ranged({ rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } }),
      ranged({ float: { min: null, max: 20_000_000 }, rvol: { min: 2, max: null } }),
    ],
    [
      'avg_buy and float',
      ranged({ avg_buy: { min: null, max: 10 }, float: { min: null, max: 20_000_000 } }),
      ranged({ float: { min: null, max: 20_000_000 }, avg_buy: { min: null, max: 10 } }),
    ],
  ]
  for (const [label, one, other] of cases) {
    it(`${label}: both clause orders return the same rows`, () => {
      const a = applyTradesFilters([...MIXED], one)
      const b = applyTradesFilters([...MIXED], other)
      expect(a.length).toBe(b.length)
      expect(a.map((r) => r.rvol)).toEqual(b.map((r) => r.rvol))
    })
  }

  it('and the row count is what the ranges themselves select', () => {
    const got = applyTradesFilters(
      [...MIXED],
      ranged({ rvol: { min: 2, max: null }, float: { min: null, max: 20_000_000 } }),
    )
    // seven rows carry an rvol, and of those all seven carry a float
    expect(got.length).toBe(7)
  })
})

describe('CN7 every numeric column has a word to be named by', () => {
  it('no column can reach the sentence without one', () => {
    const missing = NUMERIC_COLUMN_IDS.filter((id) => !COVERAGE_WORDS[id])
    expect(missing).toEqual([])
  })

  it('and no word is blank or carries an em dash', () => {
    for (const id of NUMERIC_COLUMN_IDS) {
      expect(COVERAGE_WORDS[id].length).toBeGreaterThan(0)
      expect(COVERAGE_WORDS[id]).not.toContain('—')
    }
  })
})

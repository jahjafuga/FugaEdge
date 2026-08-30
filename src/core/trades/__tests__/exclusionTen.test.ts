import { describe, expect, it } from 'vitest'
import {
  DNA_REFUSAL,
  EXCLUDABLE_FIELDS,
  LIMIT_REFUSAL,
  SORT_REFUSAL,
  UNEXCLUDABLE_FIELDS,
  resolveQuery,
  type ResolverVocabulary,
} from '@/core/trades/queryResolver'
import {
  applyTradesFilters,
  countUnmeasuredKept,
  emptyFilters,
} from '@/core/trades/tradesFilter'
import type { TradeListRow } from '@shared/trades-types'

// WHAT THIS FILE IS FOR.
//
// Ten state fields have a set an exclusion can NAME, proven by SQL twins that
// reconcile on three books. Three do not, and they fail for two different
// reasons: a limit and a sort name a PRESENTATION rather than a set of rows,
// while the five pillar verdict has a perfectly good meaning that nothing can
// verify, because it is worked out from settings and never stored.
//
// Telling a trader the wrong one of those is the dishonesty this campaign
// exists to remove, so each of the three refuses IN ITS OWN WORDS.

const NOW = new Date('2026-06-15T15:00:00Z')

const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow
const rows = (n: number, make: (i: number) => Partial<TradeListRow>) =>
  Array.from({ length: n }, (_, i) => row(make(i)))

const VOCAB: ResolverVocabulary = {
  symbols: ['HLPX', 'ASTC'],
  regions: ['China'],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
  macdStates: [],
}

const r = (q: string) => resolveQuery(q, VOCAB, NOW, emptyFilters())

describe('EX1 an exclusion on SYMBOL removes exactly the excluded rows', () => {
  it('the twin: forty four of one hundred and forty carry the symbol', () => {
    const book = [
      ...rows(44, () => ({ symbol: 'HLPX', side: 'long', net_pnl: 1 })),
      ...rows(96, () => ({ symbol: 'ASTC', side: 'long', net_pnl: 1 })),
    ]
    const out = r('not HLPX')
    expect(out.state.excludeSymbols).toEqual(['HLPX'])
    expect(applyTradesFilters(book, out.state)).toHaveLength(96)
  })
  it('and the include side is untouched by it', () => {
    const out = r('HLPX')
    expect(out.state.symbol).toBe('HLPX')
    expect(out.state.excludeSymbols).toEqual([])
  })
})

describe('EX2 an exclusion on SIDE and on OUTCOME likewise', () => {
  const book = [
    ...rows(123, () => ({ symbol: 'A', side: 'long', net_pnl: 5 })),
    ...rows(17, () => ({ symbol: 'B', side: 'short', net_pnl: -5 })),
  ]
  it('side: one hundred and twenty three long leave seventeen', () => {
    const out = r('not long')
    expect(out.state.excludeSides).toEqual(['long'])
    expect(applyTradesFilters(book, out.state)).toHaveLength(17)
  })
  it('outcome: the winners are removed and everything else stays', () => {
    const out = r('not winners')
    expect(out.state.excludeOutcomes).toEqual(['winners'])
    expect(applyTradesFilters(book, out.state)).toHaveLength(17)
  })
})

describe('EX3 a RANGE exclusion KEEPS the unmeasured row and NAMES the count', () => {
  // THE WHOLE POINT OF THIS SHAPE. A range exclusion is the negation of
  // matchesRange, which returns FALSE for a value nobody measured, so the
  // negation returns TRUE and the row SURVIVES. It is therefore in the rows
  // the caller already holds, which is why countUnmeasuredKept and not
  // countDroppedUnmeasured is the honest counter here.
  const book = [
    ...rows(117, () => ({ symbol: 'A', side: 'long', net_pnl: 1, float_shares: 5_000_000 })),
    ...rows(23, () => ({ symbol: 'A', side: 'long', net_pnl: 1, float_shares: null })),
  ]
  it('the unmeasured rows survive the exclusion', () => {
    const st = { ...emptyFilters(), excludeRanges: { float: { min: 1_000_000, max: null } } }
    const kept = applyTradesFilters(book, st)
    expect(kept).toHaveLength(23)
    expect(kept.every((t) => t.float_shares == null)).toBe(true)
  })
  it('and the counter names them from the rows the caller holds', () => {
    const st = { ...emptyFilters(), excludeRanges: { float: { min: 1_000_000, max: null } } }
    const kept = applyTradesFilters(book, st)
    const got = countUnmeasuredKept(kept, st)
    expect(got).not.toBeNull()
    expect(got!.skipped).toBe(23)
    expect(got!.column).toBe('float')
  })
})

describe('EX4 a RANGE exclusion on a FULLY covered column says NOTHING', () => {
  it('every kept row was measured, so the counter reports zero', () => {
    const book = rows(140, () => ({ symbol: 'A', side: 'long', net_pnl: 1, float_shares: 500 }))
    const st = { ...emptyFilters(), excludeRanges: { float: { min: 1_000_000, max: null } } }
    const kept = applyTradesFilters(book, st)
    expect(kept).toHaveLength(140)
    expect(countUnmeasuredKept(kept, st)!.skipped).toBe(0)
  })
})

describe('EX5 the three that cannot be excluded refuse IN THEIR OWN WORDS', () => {
  it('a LIMIT names the capability that is missing, not the ask', () => {
    const out = r('except last 10 trades')
    expect(out.refusals).toContain(LIMIT_REFUSAL)
    expect(out.state.limit, 'a refused limit must not be applied anyway').toBeNull()
  })
  it('a SORT says an ordering is not a set', () => {
    // A bare recency word: an ordering with no count beside it.
    const out = r('not newest')
    expect(out.refusals).toContain(SORT_REFUSAL)
  })
  it('the DNA verdict says it cannot be CHECKED, never that it is meaningless', () => {
    // The five pillar words are complete and incomplete; there is no
    // "scoring N" vocabulary, and inventing one here would have measured
    // nothing.
    const out = r('not complete')
    expect(out.refusals).toContain(DNA_REFUSAL)
  })
  it('and the three reasons are DIFFERENT from one another', () => {
    const three = new Set([LIMIT_REFUSAL, SORT_REFUSAL, DNA_REFUSAL])
    expect(three.size, 'two fields shared a reason, so one of them is being told a lie').toBe(3)
  })
})

describe('EX6 the TEN and the THREE are different sets, and stay that way', () => {
  // A guard that fails if a field moves between them. The membership is a
  // ruling, not an implementation detail: it came from a twin test that had to
  // reconcile on three books before a field was allowed into the ten.
  it('there are exactly ten excludable and three unexcludable', () => {
    expect(EXCLUDABLE_FIELDS).toHaveLength(10)
    expect(UNEXCLUDABLE_FIELDS).toHaveLength(3)
  })
  it('and no field is in both', () => {
    const overlap = EXCLUDABLE_FIELDS.filter((f) => (UNEXCLUDABLE_FIELDS as readonly string[]).includes(f))
    expect(overlap, 'a field claimed both a coherent twin and no coherent twin').toEqual([])
  })
  it('the three are limit, sort and dna, by name', () => {
    expect([...UNEXCLUDABLE_FIELDS].sort()).toEqual(['dna', 'limit', 'sort'])
  })
  it('and the ten do NOT contain any of them', () => {
    for (const f of ['limit', 'sort', 'dna']) {
      expect(EXCLUDABLE_FIELDS as readonly string[], `${f} slipped into the ten`).not.toContain(f)
    }
  })
})

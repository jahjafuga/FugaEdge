import { describe, expect, it } from 'vitest'
import { resolveQuery, type ResolverVocabulary } from '@/core/trades/queryResolver'
import { applyLimitAndSort, applyTradesFilters, emptyFilters } from '@/core/trades/tradesFilter'
import type { TradeListRow } from '@shared/trades-types'

// THREE THINGS ARE PINNED HERE, and the third is the reason the file exists.
//
// A GLUED RANGE. "price 2-10" is how a trader writes a range, and it read as
// nothing at all: one token the parser could not take apart. The spaced form
// worked, so the two spellings of one ask disagreed.
//
// A ROW NOBODY MEASURED SORTS LAST. It used to be coerced to negative
// infinity, which put every unmeasured trade at the TOP of an ascending sort,
// where it reads as an answer. Order only, never membership.
//
// THE NEGATOR GOVERNANCE SPAN, WHICH SHIPPED UNGUARDED. Beat one hundred
// ninety five widened how many words a negator can govern, because a five
// token name ended up half negated and the loose word was read as something
// else entirely. Beat one hundred ninety six then reverted BOTH halves of that
// fix in a scratch tree and ran the whole suite: five hundred and twenty files
// stayed green and nothing reddened. The defect it re-enables is a SILENT
// WRONG, so it gets a guard here, and the guard must go red under EITHER half
// being reverted on its own.

const NOW = new Date('2026-06-15T15:00:00Z')
const row = (over: Partial<TradeListRow>) => over as unknown as TradeListRow

const VOCAB: ResolverVocabulary = {
  symbols: ['HLPX'],
  regions: [],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [{ id: 1, name: '1-min Pullback', tier: null }],
  catalystTypes: [],
  mistakes: [
    { axis: 'psychological', name: 'Cut winner too early (fear)' },
    { axis: 'technical', name: 'Chased extended' },
  ],
  macdStates: [],
}

const r = (q: string) => resolveQuery(q, VOCAB, NOW, emptyFilters())

describe('RS1 a GLUED range applies BOTH bounds', () => {
  it('price 2-10 sets a minimum and a maximum', () => {
    const out = r('price 2-10')
    expect(out.state.ranges.avg_buy).toEqual({ min: 2, max: 10 })
  })
  it('and the currency sign the trader types changes nothing', () => {
    expect(r('price $2-$10').state.ranges.avg_buy).toEqual({ min: 2, max: 10 })
  })
  it('and a wide value splits the same way', () => {
    expect(r('float 1000000-5000000').state.ranges.float).toEqual({
      min: 1_000_000,
      max: 5_000_000,
    })
  })
  it('CONTROL -- the SPACED form still does exactly what it did', () => {
    expect(r('price 2 - 10').state.ranges.avg_buy).toEqual({ min: 2, max: 10 })
    expect(r('price 2 to 10').state.ranges.avg_buy).toEqual({ min: 2, max: 10 })
  })
  it('CONTROL -- a hyphenated ENTRY NAME is not a range and must not split', () => {
    const out = r('1-min pullback')
    expect(out.state.playbookIds, 'the entry name stopped resolving').toEqual([1])
    expect(out.state.ranges, 'a name was read as a range').toEqual({})
  })
})

describe('RS2 a row nobody measured sorts LAST, in either direction', () => {
  // Three measured values and two unmeasured ones. The unmeasured pair must sit
  // at the end whichever way the ask runs.
  const book = [
    row({ symbol: 'A', rvol: 5, open_time: '2026-01-01T10:00:00Z' }),
    row({ symbol: 'B', rvol: null, open_time: '2026-01-02T10:00:00Z' }),
    row({ symbol: 'C', rvol: 1, open_time: '2026-01-03T10:00:00Z' }),
    row({ symbol: 'D', rvol: null, open_time: '2026-01-04T10:00:00Z' }),
    row({ symbol: 'E', rvol: 3, open_time: '2026-01-05T10:00:00Z' }),
  ]
  const order = (dir: 'asc' | 'desc') =>
    applyLimitAndSort(book, { limit: null, sort: { colId: 'rvol', dir } }).map((t) => t.symbol)

  it('ascending puts the measured rows first and the unmeasured last', () => {
    expect(order('asc').slice(0, 3)).toEqual(['C', 'E', 'A'])
    expect(order('asc').slice(3).sort()).toEqual(['B', 'D'])
  })
  it('descending ALSO puts the unmeasured last, which is the whole point', () => {
    expect(order('desc').slice(0, 3)).toEqual(['A', 'E', 'C'])
    expect(order('desc').slice(3).sort()).toEqual(['B', 'D'])
  })
  it('ORDER ONLY, NEVER MEMBERSHIP: a limit returns the same COUNT either way', () => {
    const asc = applyLimitAndSort(book, { limit: 3, sort: { colId: 'rvol', dir: 'asc' } })
    const desc = applyLimitAndSort(book, { limit: 3, sort: { colId: 'rvol', dir: 'desc' } })
    expect(asc).toHaveLength(3)
    expect(desc).toHaveLength(3)
    expect(
      applyLimitAndSort(book, { limit: null, sort: { colId: 'rvol', dir: 'asc' } }),
      'a sort changed how many rows there are',
    ).toHaveLength(book.length)
  })
})

describe('RS3 a negator governs a WHOLE name, however long', () => {
  // THE GUARD BEAT 196 FOUND MISSING. "Cut winner too early (fear)" is five
  // tokens. With a three word ceiling the negator governed only the first two,
  // the reservation pass then refused the span because its halves disagreed,
  // and the loose word "winner" was read as an OUTCOME -- so an ask about one
  // named mistake excluded every winning trade.
  it('a five token mistake name excludes THAT MISTAKE', () => {
    const out = r('not cut winner too early (fear)')
    expect(out.state.excludeMistakeKeys, 'the mistake was not excluded').toEqual([
      { axis: 'psychological', name: 'Cut winner too early (fear)' },
    ])
  })
  it('and it does NOT reach the outcome, which is the defect it replaces', () => {
    const out = r('not cut winner too early (fear)')
    expect(
      out.state.excludeOutcomes,
      'the loose word winner was read as an outcome and every winner excluded',
    ).toEqual([])
    expect(out.state.outcome, 'an outcome was applied positively').toBe('all')
  })
  it('and the ROW COUNT is the complement of the mistake, not of the winners', () => {
    // THIS ASSERTION REPLACES ONE THAT DID NOT DISCRIMINATE. It used to read
    //   expect(out.unresolved.join(' ')).not.toContain('winner')
    // and it passed under the very revert it was meant to catch, because the
    // loose word is not left UNREAD -- it is silently APPLIED as an outcome.
    // Measured: under the reverted ceiling the unread set is "cut too" and
    // excludeOutcomes holds winners. Counting rows is what tells them apart.
    const book = [
      ...Array.from({ length: 4 }, () =>
        row({ symbol: 'A', net_pnl: 5, mistakeTags: [{ axis: 'psychological', name: 'Cut winner too early (fear)' }] })),
      ...Array.from({ length: 10 }, () => row({ symbol: 'B', net_pnl: 5, mistakeTags: [] })),
      ...Array.from({ length: 14 }, () => row({ symbol: 'C', net_pnl: -5, mistakeTags: [] })),
    ]
    const out = r('not cut winner too early (fear)')
    const kept = applyTradesFilters(book, out.state)
    expect(kept, 'excluding the mistake must leave the other twenty four').toHaveLength(24)
    expect(kept.filter((t) => t.net_pnl > 0), 'the winners were excluded instead').toHaveLength(10)
  })
  it('CONTROL -- a SHORT name still excludes, so the ceiling did not break it', () => {
    const out = r('not chased extended')
    expect(out.state.excludeMistakeKeys).toEqual([
      { axis: 'technical', name: 'Chased extended' },
    ])
  })
})

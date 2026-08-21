// @vitest-environment jsdom
// v0.2.7 — REGION AND COUNTRY BECOME FILTERS.
//
// MEASURED (beat 39 inventory): region and country are the highest-coverage
// gap in the app — 100% populated on all 528 real trades (China 59, Hong Kong
// 57, 16 distinct countries), indexed in the DB, already on TradeListRow,
// already driving the insights engine ("region weakness") — and reachable by
// NO TradesFilterState field. A trader holding 59 China trades could not ask
// for them.
//
// The idiom is playbookIds' / catalystTypes', exactly: an array field, OR
// within the set, AND against every other field, `null` as the unpopulated
// bucket. One wrinkle the row forces: the list read coalesces a missing region
// to the STRING 'Unknown' (list.ts:316) while a missing country stays null —
// so the null bucket matches 'Unknown'/absent for regions and IS NULL for
// countries. Options derive from the loaded book, never a hardcoded list.

import { beforeEach, describe, expect, it } from 'vitest'
import { applyTradesFilters, emptyFilters, isFiltering } from '../tradesFilter'
import {
  readTradesFilters,
  writeTradesFilters,
  filterPrefsKey,
  TRADES_FILTER_PREFS_VERSION,
} from '@/lib/prefs/tradesFilters'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

const ALL = 'all' as const

beforeEach(() => localStorage.clear())

/** Six trades shaped like the real book's geography: two China, one Hong Kong,
 *  two USA, one unresolved (country null, region 'Unknown' — what the list
 *  read hands the renderer for a failed FMP fetch or a manual trade). */
const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'ASTC', country: 'US', country_name: 'United States', region: 'USA' } as Partial<TradeListRow>),
  makeTrade({ id: 2, symbol: 'RUBI', country: 'US', country_name: 'United States', region: 'USA' } as Partial<TradeListRow>),
  makeTrade({ id: 3, symbol: 'AZI', country: 'CN', country_name: 'China', region: 'China' } as Partial<TradeListRow>),
  makeTrade({ id: 4, symbol: 'RYOJ', country: 'CN', country_name: 'China', region: 'China' } as Partial<TradeListRow>),
  makeTrade({ id: 5, symbol: 'NCRA', country: 'HK', country_name: 'Hong Kong', region: 'Hong Kong' } as Partial<TradeListRow>),
  makeTrade({ id: 6, symbol: 'INLF', country: null, country_name: 'Unknown', region: 'Unknown' } as Partial<TradeListRow>),
]

// ─── E1 ──────────────────────────────────────────────────────────────────────

describe('E1 a region narrows the book', () => {
  it("regions: ['China'] keeps exactly the China trades", () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), regions: ['China'] })
    expect(out.map((t) => t.id), 'the region filter did not narrow').toEqual([3, 4])
  })

  it('and the filter declares itself active', () => {
    expect(isFiltering({ ...emptyFilters(), regions: ['China'] })).toBe(true)
    expect(isFiltering({ ...emptyFilters(), countries: ['CN'] })).toBe(true)
  })
})

// ─── E2 ──────────────────────────────────────────────────────────────────────

describe('E2 AND across fields, OR within one', () => {
  it('two regions OR together', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), regions: ['China', 'USA'] })
    expect(out.map((t) => t.id)).toEqual([1, 2, 3, 4])
  })

  it('two countries OR together', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), countries: ['CN', 'HK'] })
    expect(out.map((t) => t.id)).toEqual([3, 4, 5])
  })

  it('region AND country intersect — a China region with a US country is empty', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      regions: ['China'],
      countries: ['US'],
    })
    expect(out).toEqual([])
  })

  it('and they AND with the rest of the state (symbol)', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      regions: ['China'],
      symbol: 'AZI',
    })
    expect(out.map((t) => t.id)).toEqual([3])
  })
})

// ─── E3 ──────────────────────────────────────────────────────────────────────

describe('E3 Hong Kong is NOT folded into China', () => {
  it('the two selections return different counts', () => {
    const china = applyTradesFilters(BOOK, { ...emptyFilters(), regions: ['China'] })
    const hk = applyTradesFilters(BOOK, { ...emptyFilters(), regions: ['Hong Kong'] })
    expect(china.length, 'China swallowed Hong Kong').not.toBe(hk.length)
    expect(china.map((t) => t.id)).toEqual([3, 4])
    expect(hk.map((t) => t.id)).toEqual([5])
  })

  it('selecting both returns the union', () => {
    const both = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      regions: ['China', 'Hong Kong'],
    })
    expect(both.map((t) => t.id)).toEqual([3, 4, 5])
  })
})

// ─── E4 ──────────────────────────────────────────────────────────────────────

describe('E4 the empty array and the null bucket', () => {
  it('an empty array filters nothing', () => {
    expect(applyTradesFilters(BOOK, { ...emptyFilters(), regions: [] }).length).toBe(6)
    expect(applyTradesFilters(BOOK, { ...emptyFilters(), countries: [] }).length).toBe(6)
    expect(isFiltering(emptyFilters())).toBe(false)
  })

  it('null in countries matches the unresolved trade (country IS NULL)', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), countries: [null] })
    expect(out.map((t) => t.id), 'the null bucket missed the unresolved row').toEqual([6])
  })

  it("null in regions matches the 'Unknown' sentinel the list read produces", () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), regions: [null] })
    expect(out.map((t) => t.id)).toEqual([6])
  })

  it('and the bucket ORs with real values, playbookIds-style', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), countries: ['HK', null] })
    expect(out.map((t) => t.id)).toEqual([5, 6])
  })
})

// ─── E5 ──────────────────────────────────────────────────────────────────────

describe('E5 the prefs blob carries both fields without orphaning older ones', () => {
  it('both round-trip, null buckets included', () => {
    writeTradesFilters(ALL, {
      ...emptyFilters(),
      regions: ['China', null],
      countries: ['CN', null],
    })
    const back = readTradesFilters(ALL)
    expect(back.regions).toEqual(['China', null])
    expect(back.countries).toEqual(['CN', null])
  })

  it('a stored blob written BEFORE the fields existed upgrades with empty defaults', () => {
    // Exactly what the shipped writer produced through beat 35: no regions,
    // no countries. Discarding it (a version bump) would throw away the
    // dates and symbol too — the additive path keeps them.
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { symbol: 'ASTC', dateFrom: '2026-08-01', dateTo: '2026-08-21' },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.regions, 'an old blob did not gain the field').toEqual([])
    expect(back.countries).toEqual([])
    expect(back.symbol, 'the upgrade cost the old fields').toBe('ASTC')
    expect(back.dateFrom).toBe('2026-08-01')
  })

  it('garbage in the new fields is dropped, not trusted', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { regions: ['China', 7, {}, null], countries: 'CN' },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.regions).toEqual(['China', null])
    expect(back.countries).toEqual([])
  })

  it('a genuinely incompatible (higher-version) blob is still discarded whole', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({ v: TRADES_FILTER_PREFS_VERSION + 1, state: { regions: ['China'] } }),
    )
    expect(readTradesFilters(ALL)).toEqual(emptyFilters())
  })
})

// ─── E6 ──────────────────────────────────────────────────────────────────────

describe('E6 a stored region the book no longer has', () => {
  it('round-trips, crashes nothing, and simply matches nothing', () => {
    writeTradesFilters(ALL, { ...emptyFilters(), regions: ['Atlantis'] })
    const back = readTradesFilters(ALL)
    expect(back.regions).toEqual(['Atlantis'])
    let out: TradeListRow[] = []
    expect(() => {
      out = applyTradesFilters(BOOK, back)
    }).not.toThrow()
    expect(out).toEqual([])
    // isFiltering true -> the page renders NoMatch with its Clear button, so
    // the user can see WHY the table is empty and escape it.
    expect(isFiltering(back)).toBe(true)
  })
})

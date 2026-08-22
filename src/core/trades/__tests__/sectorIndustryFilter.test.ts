// @vitest-environment jsdom
// v0.2.7 — J2/J3/J4/J5: SECTOR AND INDUSTRY BECOME FILTERS, MARKET CAP A RANGE.
//
// Sector and industry follow the geo idiom exactly — array field, OR within,
// AND across, null bucket for the unresolved (both are nullable on the row: a
// symbol with no market_data row carries nulls through the LEFT JOIN). Market
// cap is NOT an array: it is a number, so it registers as a numeric range
// column and inherits the whole ungated range machinery from the
// filtering-and-display split — including working while the column is hidden,
// which is the default.

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { vi } from 'vitest'
import {
  applyTradesFilters,
  emptyFilters,
  isFiltering,
  rangeValueOf,
} from '../tradesFilter'
import { NUMERIC_COLUMN_IDS, DEFAULT_COLUMN_VISIBILITY } from '@/lib/prefs/columns'
import {
  readTradesFilters,
  writeTradesFilters,
  filterPrefsKey,
  TRADES_FILTER_PREFS_VERSION,
} from '@/lib/prefs/tradesFilters'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

const ALL = 'all' as const
beforeEach(() => localStorage.clear())

const t = (over: Partial<TradeListRow>): TradeListRow => makeTrade(over as never)

/** Shaped like the real book: Industrials and Healthcare dominate; one row
 *  unresolved (no market_data). */
const BOOK: TradeListRow[] = [
  t({ id: 1, symbol: 'ASTC', sector: 'Industrials', industry: 'Aerospace & Defense', market_cap: 120_000_000 }),
  t({ id: 2, symbol: 'RUBI', sector: 'Industrials', industry: 'Marine Shipping', market_cap: 45_000_000 }),
  t({ id: 3, symbol: 'AZI', sector: 'Healthcare', industry: 'Biotechnology', market_cap: 48_000_000 }),
  t({ id: 4, symbol: 'RGNT', sector: 'Healthcare', industry: 'Biotechnology', market_cap: 900_000_000 }),
  t({ id: 5, symbol: 'NOMD', sector: null, industry: null, market_cap: null }),
]

// ─── J2 ──────────────────────────────────────────────────────────────────────

describe('J2 sectors and industries narrow, per the geo idiom', () => {
  it("sectors: ['Healthcare'] keeps exactly the Healthcare trades", () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), sectors: ['Healthcare'] })
    expect(out.map((x) => x.id), 'the sector filter did not narrow').toEqual([3, 4])
  })

  it('industries narrow on the finer grain', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), industries: ['Biotechnology'] })
    expect(out.map((x) => x.id)).toEqual([3, 4])
  })

  it('OR within a field', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      sectors: ['Healthcare', 'Industrials'],
    })
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4])
  })

  it('AND across fields — a Healthcare sector with a Marine industry is empty', () => {
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      sectors: ['Healthcare'],
      industries: ['Marine Shipping'],
    })
    expect(out).toEqual([])
  })

  it('the null bucket matches the unresolved row', () => {
    expect(applyTradesFilters(BOOK, { ...emptyFilters(), sectors: [null] }).map((x) => x.id)).toEqual([5])
    expect(applyTradesFilters(BOOK, { ...emptyFilters(), industries: [null] }).map((x) => x.id)).toEqual([5])
  })

  it('and it ORs with real values', () => {
    const out = applyTradesFilters(BOOK, { ...emptyFilters(), sectors: ['Healthcare', null] })
    expect(out.map((x) => x.id)).toEqual([3, 4, 5])
  })

  it('empty arrays filter nothing; active ones declare themselves', () => {
    expect(applyTradesFilters(BOOK, emptyFilters()).length).toBe(5)
    expect(isFiltering(emptyFilters())).toBe(false)
    expect(isFiltering({ ...emptyFilters(), sectors: ['Healthcare'] })).toBe(true)
    expect(isFiltering({ ...emptyFilters(), industries: [null] })).toBe(true)
  })
})

// ─── J3 ──────────────────────────────────────────────────────────────────────

describe('J3 market cap is a numeric range column, ungated like the rest', () => {
  it('rangeValueOf reads it and NUMERIC_COLUMN_IDS carries it', () => {
    expect((NUMERIC_COLUMN_IDS as readonly string[]).includes('market_cap')).toBe(true)
    expect(rangeValueOf(BOOK[0], 'market_cap')).toBe(120_000_000)
    expect(rangeValueOf(BOOK[4], 'market_cap')).toBeNull()
  })

  it('a range narrows while the column is HIDDEN (the default)', () => {
    expect(
      DEFAULT_COLUMN_VISIBILITY.market_cap,
      'market cap must ship hidden — it is a reference column',
    ).toBe(false)
    const out = applyTradesFilters(BOOK, {
      ...emptyFilters(),
      ranges: { market_cap: { min: 40_000_000, max: 200_000_000 } },
    })
    // null cap (id 5) is excluded by an active range — the numericRange law.
    expect(out.map((x) => x.id)).toEqual([1, 2, 3])
  })
})

// ─── J4 ──────────────────────────────────────────────────────────────────────

describe('J4 prefs round-trip, additive at version one', () => {
  it('both new arrays round-trip with their null buckets', () => {
    writeTradesFilters(ALL, {
      ...emptyFilters(),
      sectors: ['Healthcare', null],
      industries: ['Biotechnology'],
    })
    const back = readTradesFilters(ALL)
    expect(back.sectors).toEqual(['Healthcare', null])
    expect(back.industries).toEqual(['Biotechnology'])
  })

  it('an old blob upgrades with empty defaults, keeping what it had', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { symbol: 'ASTC', regions: ['China'] },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.sectors).toEqual([])
    expect(back.industries).toEqual([])
    expect(back.symbol).toBe('ASTC')
    expect(back.regions).toEqual(['China'])
  })

  it('garbage in the new fields is dropped, and a market_cap range survives the allowlist', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: {
          sectors: ['Healthcare', 7, {}],
          industries: 'Biotech',
          ranges: { market_cap: { min: 1_000_000, max: null } },
        },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.sectors).toEqual(['Healthcare'])
    expect(back.industries).toEqual([])
    expect(back.ranges.market_cap, 'the allowlist rejected the new column').toEqual({ min: 1_000_000, max: null })
  })
})

// ─── J5 ──────────────────────────────────────────────────────────────────────

describe('J5 the dropdown options derive from the loaded book', () => {
  it('the Sector dropdown lists exactly the book sectors, counts attached, Unknown for the unresolved', async () => {
    const { default: TradesFilters } = await import('@/components/trades/TradesFilters')
    render(
      React.createElement(TradesFilters, {
        filters: emptyFilters(),
        onChange: () => {},
        trades: BOOK,
      }),
    )
    fireEvent.click(screen.getByTitle('Filter by sector'))
    const panelTexts = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
    expect(panelTexts.some((x) => x.includes('Industrials'))).toBe(true)
    expect(panelTexts.some((x) => x.includes('Healthcare'))).toBe(true)
    // a sector the book does not hold is NOT offered
    expect(panelTexts.some((x) => x.includes('Energy'))).toBe(false)
    // the unresolved bucket is offered by name
    expect(panelTexts.some((x) => x.includes('Unknown'))).toBe(true)
    cleanup()
  })
})

// @vitest-environment jsdom
// v0.2.7 — ROWS MUST NOT SURVIVE A COLUMN CHANGE.
//
// MEASURED from the running build, immediately after Reset to defaults, header
// showing 12 columns:
//   rows 1-5   12 cells
//   row 6      14 cells
//   rows 7+    16 cells, with Float and Timeframe values still in them
//   row 9      a real Mistakes value in a table whose header has no Mistakes column
//
// Different rows are rendering DIFFERENT column models at the same instant. That is
// not a cell renderer returning nothing; it is rows that never re-rendered at all.
//
// WHY THE EXISTING SUITE CANNOT SEE IT: every other table test asserts on a fresh
// render(), and React.memo can only go stale on an UPDATE. A row mounted after the
// change is always correct. These tests toggle visibility on an already-mounted
// table, which is the only way the divergence is reachable.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}

const TRADES: TradeListRow[] = Array.from({ length: 10 }, (_, i) =>
  makeTrade({
    id: i + 1, symbol: `SYM${i}`, date: '2026-08-05', side: 'long',
    open_time: '2026-08-05T13:42:42Z', close_time: '2026-08-05T14:10:00Z',
    net_pnl: 100 + i, gross_pnl: 110 + i, total_fees: 10,
    mistakes: (i === 8 ? ['Cut winner short'] : []) as never,
    float_shares: 5_000_000, entry_timeframe: '1m',
  }),
)

const showAll = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}

const headerCount = () => document.querySelectorAll('thead th').length
const dataRows = () =>
  Array.from(document.querySelectorAll('tbody tr')).filter(
    (tr) => tr.querySelectorAll('td').length > 1,
  )
/** THE INVARIANT: every rendered row, not just the first. */
const expectAligned = (why: string) => {
  const h = headerCount()
  const counts = dataRows().map((r) => r.querySelectorAll('td').length)
  const bad = counts.map((c, i) => (c === h ? null : `row ${i + 1}: ${c}`)).filter(Boolean)
  expect(
    bad,
    `${why}\nheader has ${h} cells; these rows disagree: ${bad.join(', ')}\n` +
      `all row counts: ${JSON.stringify(counts)}`,
  ).toEqual([])
}

const openMenu = () => fireEvent.click(screen.getByTestId('columns-button'))
const toggle = (id: string) =>
  fireEvent.click(screen.getByTestId(`col-toggle-${id}`).querySelector('input') as Element)

beforeEach(() => localStorage.clear())

describe('T1/T2 the reported sequence', () => {
  it('T2 all columns on, then Reset to defaults — every row follows the header', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expectAligned('before the reset')
    const wide = headerCount()

    openMenu()
    fireEvent.click(screen.getByTestId('columns-reset'))

    expect(headerCount(), 'the reset did not narrow the header').toBeLessThan(wide)
    expectAligned('after Reset to defaults')
  })

  it('and no row keeps a value from a column the header no longer has', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    fireEvent.click(screen.getByTestId('columns-reset'))

    // Mistakes is hidden by default, and row 9 is the only row carrying one.
    const headers = Array.from(document.querySelectorAll('thead th')).map((e) =>
      e.textContent?.trim(),
    )
    expect(headers).not.toContain('Mistakes')
    expect(document.body.textContent).not.toContain('Cut winner short')
  })
})

describe('T3/T4 a single column, off and on', () => {
  it('T3 turning one OFF updates rows that were already on screen', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const before = headerCount()
    openMenu()
    toggle('float')
    expect(headerCount()).toBe(before - 1)
    expectAligned('after hiding Float')
  })

  it('T4 turning one ON does the same', () => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ float: false }))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const before = headerCount()
    openMenu()
    toggle('float')
    expect(headerCount()).toBe(before + 1)
    expectAligned('after showing Float')
  })

  it('a swap that keeps the COUNT the same still updates every row', () => {
    // One off, one on: a memo signal keyed on the number of visible columns would
    // sail straight through this.
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const before = headerCount()
    openMenu()
    toggle('float')
    toggle('mistakes')
    expect(headerCount()).toBe(before - 2)
    toggle('float')
    expect(headerCount()).toBe(before - 1)
    expectAligned('after a same-count swap')
  })

  it('several changes in a row leave nothing behind', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    for (const id of ['float', 'mistakes', 'catalyst', 'spark', 'entry_timeframe']) {
      toggle(id)
      expectAligned(`after toggling ${id}`)
    }
  })
})

describe('T5 STAND-DOWN', () => {
  it('with no visibility change, rows render normally', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expectAligned('on first render')
    expect(dataRows().length).toBe(TRADES.length)
  })

  it('opening and closing the menu without touching anything changes nothing', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const before = headerCount()
    openMenu()
    fireEvent.click(screen.getByTestId('columns-button'))
    expect(headerCount()).toBe(before)
    expectAligned('after opening and closing the menu')
  })
})

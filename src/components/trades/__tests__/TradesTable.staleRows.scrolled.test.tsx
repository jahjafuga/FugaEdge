// @vitest-environment jsdom
// v0.2.7 — T6: the same invariant on RECYCLED rows.
//
// The shared passthrough virtualizer reports a window starting at index 0, so every
// row in every other test is a first-window row. The reported frame was taken part
// way down a scrolled list, where the rows on screen are ones the virtualizer has
// carried through several windows — exactly the rows React.memo has had the most
// opportunity to skip.
//
// This supplies a scrolled window, the way the colSpan test had to, and re-asserts
// the invariant across it.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// Rows 6..13 of 40 — a mid-list window, so both spacers render and every visible
// row is one the virtualizer scrolled to rather than mounted at the top.
const VROW = 40
const FIRST = 6
const WINDOW = 8
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(WINDOW, count) }, (_, i) => {
        const index = i + FIRST
        return {
          index, key: index,
          start: index * VROW, end: (index + 1) * VROW, size: VROW, lane: 0,
        }
      }),
    getTotalSize: () => count * VROW,
  }),
}))

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}

const TRADES: TradeListRow[] = Array.from({ length: 40 }, (_, i) =>
  makeTrade({
    id: i + 1, symbol: `SYM${i}`, date: '2026-08-05',
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
const expectAligned = (why: string) => {
  const h = headerCount()
  const counts = dataRows().map((r) => r.querySelectorAll('td').length)
  const bad = counts.map((c, i) => (c === h ? null : `row ${i + 1}: ${c}`)).filter(Boolean)
  expect(bad, `${why}\nheader ${h}; disagreeing rows: ${bad.join(', ')}`).toEqual([])
}

const openMenu = () => fireEvent.click(screen.getByTestId('columns-button'))
const toggle = (id: string) =>
  fireEvent.click(screen.getByTestId(`col-toggle-${id}`).querySelector('input') as Element)

beforeEach(() => localStorage.clear())

describe('T6 recycled rows follow the header too', () => {
  it('the fixture really is a scrolled window', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(dataRows().length).toBe(WINDOW)
    // Row index 8 is inside the window, so the mistake value is on screen to begin with.
    expect(document.body.textContent).toContain('Cut winner short')
  })

  it('Reset to defaults leaves no recycled row behind', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expectAligned('before the reset')
    openMenu()
    fireEvent.click(screen.getByTestId('columns-reset'))
    expectAligned('after Reset, mid-list')
    expect(document.body.textContent).not.toContain('Cut winner short')
  })

  it('a single toggle updates every recycled row', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    toggle('float')
    expectAligned('after hiding Float, mid-list')
    toggle('float')
    expectAligned('after showing Float again, mid-list')
  })

  it('the spacers around them still span exactly the visible columns', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    fireEvent.click(screen.getByTestId('columns-reset'))
    const h = headerCount()
    const spacers = Array.from(document.querySelectorAll('tbody tr')).filter(
      (tr) => tr.querySelectorAll('td').length === 1 && tr.querySelector('td[colspan]'),
    )
    expect(spacers.length).toBeGreaterThan(0)
    for (const s of spacers) {
      expect(Number(s.querySelector('td')?.getAttribute('colspan'))).toBe(h)
    }
  })
})

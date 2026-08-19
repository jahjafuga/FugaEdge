// @vitest-environment jsdom
// v0.2.7 Feature 1, the missing half — the filter belongs at the top.
//
// The filter card governs EVERY widget on this tab (tiles, equity curve, drawdown,
// bookends, and the day-by-day charts), but it shipped at the BOTTOM, tucked inside
// the Daily-breakdown section. A control that governs a whole page is unreachable
// where it was and reads as if it only scopes the section it sits in.
//
// T3 is the one that matters: moving a control is exactly the change that silently
// unwires it, and every assertion above it would still pass on a filter bar wired
// to nothing.

import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewTab from '../OverviewTab'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// jsdom ships no ResizeObserver; recharts' ResponsiveContainer requires one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

/** Two symbols so a symbol filter has something to remove. */
const TRADES: TradeListRow[] = [
  makeTrade({
    id: 1, symbol: 'AAAA', date: '2026-08-10',
    open_time: '2026-08-10T13:30:00Z', close_time: '2026-08-10T14:00:00Z',
    net_pnl: 500, gross_pnl: 510, total_fees: 10,
  }),
  makeTrade({
    id: 2, symbol: 'BBBB', date: '2026-08-11',
    open_time: '2026-08-11T13:30:00Z', close_time: '2026-08-11T14:00:00Z',
    net_pnl: -200, gross_pnl: -190, total_fees: 10,
  }),
  makeTrade({
    id: 3, symbol: 'BBBB', date: '2026-08-12',
    open_time: '2026-08-12T13:30:00Z', close_time: '2026-08-12T14:00:00Z',
    net_pnl: -100, gross_pnl: -90, total_fees: 10,
  }),
]

const renderTab = () =>
  render(
    <MemoryRouter>
      <OverviewTab trades={TRADES} />
    </MemoryRouter>,
  )

/** DOM order index of the toolbar strip. Anchored on the strip itself rather than
 *  a heading: the FILTERS eyebrow was deliberately deleted when the card became a
 *  toolbar, and a position test that depends on a label is really a label test. */
const toolbarOrder = (): number =>
  Array.from(document.querySelectorAll('*')).findIndex(
    (el) => (el as HTMLElement).dataset?.testid === 'overview-toolbar',
  )

/** DOM order index of the first node whose text matches. */
const orderOf = (text: string | RegExp): number => {
  const all = Array.from(document.querySelectorAll('*'))
  return all.findIndex((el) =>
    typeof text === 'string'
      ? el.textContent?.trim() === text && el.children.length === 0
      : text.test(el.textContent ?? '') && el.children.length === 0,
  )
}

beforeEach(() => document.body.replaceChildren())

describe('the filter control governs the tab, so it sits above the tab', () => {
  it('T1 renders ABOVE the equity curve in DOM order', () => {
    renderTab()
    const filters = toolbarOrder()
    const equity = orderOf('Equity curve')
    const overviewHeader = orderOf('Overview')
    expect(filters).toBeGreaterThan(-1)
    expect(equity).toBeGreaterThan(-1)
    expect(filters).toBeLessThan(equity)
    // ...and above the section header too — it governs the whole tab, not one section.
    expect(filters).toBeLessThan(overviewHeader)
  })

  it('T2 no filter control renders inside the DAILY BREAKDOWN section', () => {
    renderTab()
    const filters = toolbarOrder()
    const daily = orderOf('Daily breakdown')
    expect(daily).toBeGreaterThan(-1)
    expect(filters).toBeLessThan(daily)
  })

  it('T4 exactly ONE filter control renders on the tab', () => {
    renderTab()
    // A move that copies instead of moving leaves two live controls disagreeing
    // about the same state.
    expect(document.querySelectorAll('[data-testid="overview-toolbar"]')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('Symbol')).toHaveLength(1)
    expect(screen.getAllByTestId('overview-scope')).toHaveLength(1)
    // Reset is conditional now, so activate something before counting it.
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(screen.getAllByTitle('Reset all filters')).toHaveLength(1)
  })
})

describe('T3 STAND-DOWN: the move must not unwire the filter', () => {
  /** Text of the tile whose label matches, e.g. "Trade Count". */
  const tileValue = (label: string): string => {
    const labelEl = Array.from(document.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === label,
    )
    return labelEl?.parentElement?.textContent?.replace(label, '').trim() ?? ''
  }

  it('filtering by symbol still changes the tiles', () => {
    renderTab()
    const before = tileValue('Trade count')
    expect(before).toContain('3')

    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })

    const after = tileValue('Trade count')
    expect(after).not.toBe(before)
    expect(after).toContain('1')
  })

  it('filtering still changes the equity curve, the drawdown and the daily breakdown', () => {
    renderTab()
    // BBBB is Aug 11 + Aug 12; AAAA is Aug 10 alone. The drawdown's trough date
    // and the curve behind it can only differ by symbol if the filter is still
    // wired to the snapshot the whole tab reads from.
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'BBBB' } })
    expect(document.body.textContent).toContain('Trough')
    expect(document.body.textContent).toContain('Aug 12 2026')

    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(document.body.textContent).not.toContain('Aug 12 2026')
    expect(document.body.textContent).toContain('Aug 10 2026')

    // The day-by-day charts below are fed from the same filtered set: a symbol
    // that matches nothing empties them.
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'ZZZZ' } })
    const empties = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'No trades in this range.',
    )
    expect(empties.length).toBeGreaterThan(0)
  })

  it('the side filter reaches the tiles too', () => {
    renderTab()
    const before = tileValue('Trade count')
    expect(before).toContain('3')
    fireEvent.click(screen.getByText('Short'))
    // Every fixture trade is a long, so a short filter empties the book.
    expect(tileValue('Trade count')).not.toBe(before)
  })
})

// @vitest-environment jsdom
// v0.2.7 design candidate — the filter card becomes a toolbar.
//
// The pinned bar was a full Card: an eyebrow reading FILTERS above a description
// reading "Symbol, side, and range — expand for more", above the controls. Both
// strings described controls that were already visible, and the whole block was
// pinned to the top of a long scrolling tab, so it cost more of the viewport than
// the widgets it governs.
//
// The scope line is the most important status on the page — it is the only thing
// that says you are looking at a subset — so it moves into the row and is promoted
// the moment anything narrows.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewTab from '../OverviewTab'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

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
]

const renderTab = () =>
  render(
    <MemoryRouter>
      <OverviewTab trades={TRADES} />
    </MemoryRouter>,
  )

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const scopeEl = () => screen.getByTestId('overview-scope')

beforeEach(() => document.body.replaceChildren())

// ── T4 ──────────────────────────────────────────────────────────────────────
describe('T4 RESET renders only when there is something to reset', () => {
  it('is absent on arrival, with nothing narrowed', () => {
    renderTab()
    expect(screen.queryByTitle('Reset all filters')).toBeNull()
  })

  it('appears the moment a non-date filter narrows the set', () => {
    renderTab()
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(screen.getByTitle('Reset all filters')).toBeTruthy()
  })

  it('appears for a date range too — a window is a subset like any other', () => {
    renderTab()
    fireEvent.click(screen.getByText('7D'))
    expect(screen.getByTitle('Reset all filters')).toBeTruthy()
  })
})

// ── the scope line's promotion ──────────────────────────────────────────────
describe('the scope line is quiet at rest and impossible to miss when narrowed', () => {
  it('renders inside the toolbar row, not below it', () => {
    renderTab()
    const strip = screen.getByTestId('overview-toolbar')
    expect(strip.contains(scopeEl())).toBe(true)
  })

  it('is muted while the whole book is in view', () => {
    renderTab()
    const cls = scopeEl().className
    expect(cls).toContain('text-fg-tertiary')
    expect(cls).not.toContain('text-gold')
  })

  it('is promoted the moment anything narrows', () => {
    renderTab()
    const before = scopeEl().className
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    const after = scopeEl().className
    expect(after).not.toBe(before)
    expect(after).toContain('text-gold')
    expect(after).not.toContain('text-fg-tertiary')
  })

  it('is promoted for a date range as well', () => {
    renderTab()
    fireEvent.click(screen.getByText('7D'))
    expect(scopeEl().className).toContain('text-gold')
  })

  it('still says what it said before — the words are unchanged, only the weight', () => {
    renderTab()
    expect(scopeEl().textContent).toBe('2 of 2 round trips · All time')
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(scopeEl().textContent).toBe('1 of 2 round trip · Filtered')
  })
})

// ── T5 ──────────────────────────────────────────────────────────────────────
describe('T5 the removed strings stay removed', () => {
  const BAR = 'src/components/analytics/AnalyticsFilterBar.tsx'

  it('the FILTERS eyebrow and its description are gone from the source', () => {
    const bar = src(BAR)
    // Both described controls that are visible on the row beneath them, and both
    // cost vertical space on a bar pinned to the top of a long tab.
    expect(bar).not.toContain('Symbol, side, and range')
    expect(bar).not.toMatch(/title="Filters"/)
  })

  it('the strip is no longer a Card — a control strip is not a content container', () => {
    const bar = src(BAR)
    expect(bar).not.toMatch(/<Card\b/)
    expect(bar).not.toMatch(/from '@\/components\/ui\/Card'/)
  })

  it('and nothing renders the word Filters as a heading any more', () => {
    renderTab()
    const headings = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Filters',
    )
    expect(headings).toEqual([])
  })
})

// @vitest-environment jsdom
//
// Dave #15 — ONE SHARES SEMANTIC. All Round Trips collapses the BOUGHT +
// SOLD quantity pair into one SHARES column = position size —
// Math.max(shares_bought, shares_sold), the metrics layer's own pinned
// convention (metrics.ts:234, avgShareSize.ts, week.test.ts's unbalanced-
// trip pin). BUY AVG / SELL AVG stay (Dave circled only the quantity
// pair). Every collapsed cell carries title="Bought N · Sold M" so the
// removed columns' information stays one hover away.
//
// Also pins that the FLOAT/CATALYST/MISTAKES optional-column toggles keep
// splicing correctly around the collapsed layout — their findIndex anchors
// ('net_pnl', 'playbook', 'country', 'catalyst') are index-agnostic.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import TradesTable from '../TradesTable'
import { COLUMN_PREFS_KEY } from '@/lib/prefs/columns'

// TradesTable renders TradeDetailModal, which (via PlaybookPicker) calls
// ipc.playbooksList() on mount — stub the whole ipc surface (house pattern
// from TradesTable.sorting.test.tsx).
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// Make every row "visible" under jsdom (the real virtualizer renders 0 rows
// because clientHeight is 0).
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}

const PROPS = {
  onSaveNote: noop,
  onSaveTimeframe: noop,
  onSavePlaybook: noop,
  onSaveConfidence: noop,
  onSavePlannedRisk: noop,
  onSavePlannedStopLoss: noop,
  onSaveFloat: noop,
  onSaveCatalyst: noop,
  onSaveCountry: noop,
  showCountryColumn: false,
}

// v0.2.7: visibility is persisted state, not props. The helper seeds the pref the
// way the app does, so these still exercise the real path.
const renderTable = (trades: TradeListRow[], show: Record<string, boolean> = {}) => {
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(show))
  return render(<TradesTable {...PROPS} trades={trades} />)
}

const tableEl = () => screen.getByRole('table')

const headers = (): string[] =>
  Array.from(tableEl().querySelectorAll('thead th')).map((el) => el.textContent?.trim() ?? '')

/** Displayed row order via the Symbol cell (index derived from the header row). */
const rowSymbols = (): string[] => {
  const idx = headers().findIndex((h) => h === 'Symbol')
  const body = tableEl().querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr'))
    .map((tr) => tr.children[idx]?.textContent?.trim() ?? '')
    .filter((s) => s !== '')
}

const header = (label: string): HTMLElement => {
  const th = Array.from(tableEl().querySelectorAll('thead th')).find(
    (el) => el.textContent?.trim() === label,
  )
  if (!th) throw new Error(`no column header "${label}"`)
  return th as HTMLElement
}

// Distinct positions so the sort order is unambiguous: S1=100, S2=300,
// S3=200 (equal legs); S4 is the unbalanced trip — bought 50 / sold 250,
// position = max = 250 (the old sum would say 300 and tie with S2).
const ROWS: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'S1', shares_bought: 100, shares_sold: 100 }),
  makeTrade({ id: 2, symbol: 'S2', shares_bought: 300, shares_sold: 300 }),
  makeTrade({ id: 3, symbol: 'S3', shares_bought: 200, shares_sold: 200 }),
  makeTrade({
    id: 4,
    symbol: 'S4',
    shares_bought: 50,
    shares_sold: 250,
    side: 'short',
    is_open: true,
    close_time: null,
  }),
]

describe('TradesTable — the BOUGHT+SOLD collapse (Dave #15)', () => {
  it('(3a) one SHARES column; BOUGHT and SOLD headers gone; BUY AVG + SELL AVG intact', () => {
    renderTable(ROWS)
    const h = headers()
    expect(h.filter((x) => x === 'Shares')).toHaveLength(1)
    expect(h).not.toContain('Bought')
    expect(h).not.toContain('Sold')
    expect(h).toContain('Buy avg')
    expect(h).toContain('Sell avg')
    // The collapsed column sits where the pair sat: after Side, before Buy avg.
    expect(h.indexOf('Shares')).toBe(h.indexOf('Side') + 1)
    expect(h.indexOf('Buy avg')).toBe(h.indexOf('Shares') + 1)
  })

  it('(3b) numeric sort on SHARES works over the position value (max of legs)', () => {
    renderTable(ROWS)
    // Numeric column: first click is DESCENDING (TanStack getAutoSortDir).
    fireEvent.click(header('Shares'))
    expect(rowSymbols()).toEqual(['S2', 'S4', 'S3', 'S1']) // 300, 250, 200, 100
    fireEvent.click(header('Shares'))
    expect(rowSymbols()).toEqual(['S1', 'S3', 'S4', 'S2']) // 100, 200, 250, 300
  })

  it('(4) unequal legs render the max with both legs in the title; equal legs keep the title too', () => {
    renderTable(ROWS)
    const unequal = screen.getByTitle('Bought 50 · Sold 250')
    expect(unequal.textContent).toContain('250')
    expect(screen.getByTitle('Bought 300 · Sold 300').textContent).toContain('300')
  })

  // v0.2.7: the column array no longer changes SHAPE with the toggles — every
  // column is always defined, in one fixed order, and visibility hides them. The
  // guarantee these pinned (columns stay in the right relative order for any on/off
  // combination) is now structural rather than the product of four splice sites.
  it('(7a) FLOAT sits just before Net P&L when shown', () => {
    renderTable(ROWS, { float: true })
    const h = headers()
    expect(h.indexOf('Float')).toBe(h.indexOf('Net P&L') - 1)
    expect(h.filter((x) => x === 'Shares')).toHaveLength(1)
  })

  it('(7b) CATALYST sits right after Playbook when Country is hidden', () => {
    renderTable(ROWS, { catalyst: true, country: false })
    const h = headers()
    expect(h.indexOf('Catalyst')).toBe(h.indexOf('Playbook') + 1)
    expect(h.filter((x) => x === 'Shares')).toHaveLength(1)
  })

  it('(7c) MISTAKES sits right after Playbook when Country and Catalyst are hidden', () => {
    renderTable(ROWS, { mistakes: true, country: false, catalyst: false })
    const h = headers()
    expect(h.indexOf('Mistakes')).toBe(h.indexOf('Playbook') + 1)
    expect(h.filter((x) => x === 'Shares')).toHaveLength(1)
  })

  it('(7d) Playbook -> Country -> Catalyst -> Mistakes stay grouped, Float before Net P&L', () => {
    renderTable(ROWS, { float: true, catalyst: true, mistakes: true })
    const h = headers()
    const pb = h.indexOf('Playbook')
    expect(h.indexOf('Catalyst')).toBeGreaterThan(pb)
    expect(h.indexOf('Mistakes')).toBe(h.indexOf('Catalyst') + 1)
    expect(h.indexOf('Float')).toBe(h.indexOf('Net P&L') - 1)
    expect(h.filter((x) => x === 'Shares')).toHaveLength(1)
  })
})

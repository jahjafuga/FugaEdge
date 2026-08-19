// @vitest-environment jsdom
// v0.2.7 — the virtualizer's spacer rows invent columns that do not exist.
//
// The table is `tableLayout: fixed`, so its column model is whatever the widest
// row declares. The scroll spacers render `<td colSpan={colCount}>`, and colCount
// was computed from the WHOLE registry rather than from the visible columns:
//
//   registry 33 + checkbox = 34 declared
//   default install shows 12 + checkbox = 13 real
//   -> 21 phantom columns, created the moment the list is scrolled far enough to
//      need a top spacer, and destroyed again when it is scrolled back
//
// Phantom columns are not inert under a fixed layout: they take a share of the
// table's width, so the real columns compress. This asserts the spacer spans
// exactly the columns that exist.
//
// The passthrough virtualizer used everywhere else reports a window starting at
// index 0, so paddingTop is always 0 and no spacer ever renders — which is why
// no existing test could see this. This file supplies a scrolled window instead.

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// A SCROLLED window: rows 4..7 of 12 are visible, so the component renders both a
// top and a bottom spacer. Public VirtualItem contract only, like the passthrough.
const VROW = 40
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(4, count) }, (_, i) => {
        const index = i + 4
        return { index, key: index, start: index * VROW, end: (index + 1) * VROW, size: VROW, lane: 0 }
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

const TRADES: TradeListRow[] = Array.from({ length: 12 }, (_, i) =>
  makeTrade({ id: i + 1, symbol: `SYM${i}`, date: '2026-08-05' }),
)

const showOnly = (ids: string[]) => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = ids.includes(id)
  v.symbol = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}

const headerCount = () => document.querySelectorAll('thead th').length
const spacers = () =>
  Array.from(document.querySelectorAll('tbody tr')).filter(
    (tr) => tr.querySelectorAll('td').length === 1 && tr.querySelector('td[colspan]'),
  )

beforeEach(() => localStorage.clear())

describe('the scroll spacers span the columns that exist, not the whole registry', () => {
  it('renders spacers at all — the fixture is a scrolled window', () => {
    showOnly(['open_time', 'symbol', 'side', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(spacers().length, 'no spacer rendered; the mock is not scrolled').toBeGreaterThan(0)
  })

  it('T6 colSpan equals the visible column count, inventing nothing', () => {
    showOnly(['open_time', 'symbol', 'side', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const h = headerCount()
    for (const s of spacers()) {
      const span = Number(s.querySelector('td')?.getAttribute('colspan'))
      expect(
        span,
        `a spacer spans ${span} columns while the table has ${h}; the extra ` +
          `${span - h} are phantom columns that take width from the real ones`,
      ).toBe(h)
    }
  })

  it('and it tracks visibility — turning columns on must move it', () => {
    showOnly(['open_time', 'symbol', 'side', 'net_pnl'])
    const { unmount } = render(<TradesTable {...PROPS} trades={TRADES} />)
    const few = Number(spacers()[0].querySelector('td')?.getAttribute('colspan'))
    unmount()
    document.body.replaceChildren()
    localStorage.clear()

    showOnly([...ALL_COLUMN_IDS])
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const many = Number(spacers()[0].querySelector('td')?.getAttribute('colspan'))
    expect(many).toBeGreaterThan(few)
    expect(many).toBe(headerCount())
  })

  it('the body rows themselves are still full width beside the spacers', () => {
    showOnly(['open_time', 'symbol', 'side', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const h = headerCount()
    const dataRows = Array.from(document.querySelectorAll('tbody tr')).filter(
      (tr) => tr.querySelectorAll('td').length > 1,
    )
    expect(dataRows.length).toBeGreaterThan(0)
    for (const r of dataRows) expect(r.querySelectorAll('td').length).toBe(h)
  })
})

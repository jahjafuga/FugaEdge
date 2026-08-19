// @vitest-environment jsdom
// v0.2.7 Feature 3 Commit 3 — T21. Provenance is only useful if the user can see it
// across the whole book at once, which means it has to be a real column in Feature
// 4's registry rather than a detail-modal-only badge.

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import {
  ALL_COLUMN_IDS,
  COLUMN_LABELS,
  COLUMN_PREFS_KEY,
  DEFAULT_COLUMN_VISIBILITY,
  NUMERIC_COLUMN_IDS,
} from '@/lib/prefs/columns'
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

const TRADES: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'AAAA', planned_stop_loss_price: 9.5, stop_source: 'manual' }),
  makeTrade({ id: 2, symbol: 'BBBB', planned_stop_loss_price: 19.3, stop_source: 'auto' }),
  makeTrade({ id: 3, symbol: 'CCCC', planned_stop_loss_price: null, stop_source: null }),
]

const show = (id: string) =>
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ [id]: true }))
const headers = () =>
  Array.from(document.querySelectorAll('thead th')).map((e) => e.textContent?.trim() ?? '')
const columnCells = (label: string) => {
  const i = headers().indexOf(label)
  return Array.from(document.querySelectorAll('tbody tr')).map(
    (r) => Array.from(r.querySelectorAll('td'))[i]?.textContent?.trim() ?? '',
  )
}

beforeEach(() => localStorage.clear())

describe('T21 stop_source is a first-class column', () => {
  it('is registered, labelled, and hidden by default like every other v0.2.7 column', () => {
    expect([...ALL_COLUMN_IDS]).toContain('stop_source')
    expect(COLUMN_LABELS['stop_source']).toBeTruthy()
    expect(DEFAULT_COLUMN_VISIBILITY['stop_source']).toBe(false)
    // Not a number: 'manual' and 'auto' have no order, so a min/max range would be
    // meaningless. T30's reachability guard reads this list, so leaving it out is
    // the statement that no range input should exist for it.
    expect([...NUMERIC_COLUMN_IDS]).not.toContain('stop_source')
  })

  it('renders a readable value per row, and an em dash where there is no stop', () => {
    show('stop_source')
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const label = COLUMN_LABELS['stop_source']
    expect(headers()).toContain(label)
    const cells = columnCells(label)
    expect(cells[0]).toMatch(/manual/i)
    expect(cells[1]).toMatch(/auto/i)
    expect(cells[2]).toBe('—') // absent is not a third kind of stop
  })

  it('can be hidden like any other column', () => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ stop_source: false }))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(headers()).not.toContain(COLUMN_LABELS['stop_source'])
  })

  it('appears in the Columns menu under its label', () => {
    show('stop_source')
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(screen.getAllByText(COLUMN_LABELS['stop_source']).length).toBeGreaterThan(0)
  })
})

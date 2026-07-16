// @vitest-environment jsdom
//
// Dave #17 — the TABLE-CONTEXT half of the sticky tab. The trade modal's
// tab reset lived on every [trade?.id] change, so cycling in the Trades
// window snapped back to Overview — the parked wart. The prevIdRef
// discriminator lands in the modal itself, so this context un-parks in
// the same edit: cycle keeps the tab, every close path nulls the ref,
// fresh open resets to Overview.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import TradesTable from '../TradesTable'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

vi.mock('@/components/trades/ChartTab', () => ({ default: () => null }))

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

// Default sort is open_time DESC — TT-A (14:00) displays before TT-B (13:00).
const ROWS: TradeListRow[] = [
  makeTrade({
    id: 11,
    symbol: 'TT-A',
    open_time: '2026-05-20T14:00:00.000Z',
    close_time: '2026-05-20T14:10:00.000Z',
    note: { text: 'table alpha' },
  }),
  makeTrade({
    id: 12,
    symbol: 'TT-B',
    open_time: '2026-05-20T13:00:00.000Z',
    close_time: '2026-05-20T13:10:00.000Z',
    note: { text: 'table beta' },
  }),
]

const modal = () => document.querySelector('[aria-labelledby="trade-detail-title"]') as HTMLElement
const modalSymbol = () => document.getElementById('trade-detail-title')?.textContent ?? null

describe('TradesTable — sticky tab through cycling (Dave #17, the un-parked wart)', () => {
  it('(6) cycle keeps the tab; close + reopen resets to Overview', async () => {
    render(<TradesTable {...PROPS} trades={ROWS} />)

    fireEvent.click(screen.getByText('TT-A'))
    await waitFor(() => expect(modalSymbol()).toBe('TT-A'))
    expect(within(modal()).getByText('1 of 2')).toBeTruthy()

    fireEvent.click(within(modal()).getByRole('tab', { name: /Journal/ }))
    expect((within(modal()).getByRole('textbox') as HTMLTextAreaElement).value).toBe('table alpha')

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await waitFor(() => expect(modalSymbol()).toBe('TT-B'))
    // The un-parked wart: the tab survives the cycle in the TABLE context too.
    expect(within(modal()).getByRole('tab', { name: /Journal/ }).getAttribute('aria-selected')).toBe('true')
    expect((within(modal()).getByRole('textbox') as HTMLTextAreaElement).value).toBe('table beta')

    // Esc closes; reopening is a FRESH open — Overview again.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(modalSymbol()).toBeNull())
    fireEvent.click(screen.getByText('TT-A'))
    await waitFor(() => expect(modalSymbol()).toBe('TT-A'))
    expect(within(modal()).getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true')
  })
})

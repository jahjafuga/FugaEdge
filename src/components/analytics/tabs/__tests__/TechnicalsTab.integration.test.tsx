import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import TechnicalsTab from '../TechnicalsTab'

// Integration test for the full Technicals tab through Section 4 (EMA). The tab
// fetches via ipc.listTradesWithTechnicals on mount and drills into ipc.getTrade
// for the detail sheet — both mocked (F2.1 pattern). useThemeMode is mocked to a
// fixed dark theme so the VWAP/EMA distance bands' chartColors lookup is hermetic;
// the rest of the module is preserved.
const { listSpy, getTradeSpy } = vi.hoisted(() => ({
  listSpy: vi.fn(),
  getTradeSpy: vi.fn(),
}))
vi.mock('@/lib/ipc', () => ({
  ipc: { listTradesWithTechnicals: listSpy, getTrade: getTradeSpy },
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, useThemeMode: () => ({ resolved: 'dark' as const }) }
})

// One trade At VWAP (v3, vwap_dist_pct 0.1) on 1m, also MACD-classifiable.
const AT_VWAP_ROW: TradeWithTechnicalsRow = makeRow({
  id: 1,
  net_pnl: 100,
  technicals: makeCompleteSnapshot({
    macd_positive: true,
    macd_rising: true,
    vwap_dist_pct: 0.1,
  }),
})

beforeEach(() => {
  listSpy.mockReset()
  listSpy.mockResolvedValue([AT_VWAP_ROW])
  getTradeSpy.mockReset()
  getTradeSpy.mockResolvedValue(makeTrade())
})

describe('TechnicalsTab — Sections 2 + 3 integration', () => {
  it('renders both the MACD State and VWAP distance bands once data loads', async () => {
    render(<TechnicalsTab />)
    expect(await screen.findByText('VWAP distance')).toBeTruthy()
    expect(screen.getByText('MACD state')).toBeTruthy()
  })

  it('drills a VWAP bucket → table row → TradeDetailSheet, then closes', async () => {
    const { container } = render(<TechnicalsTab />)
    await screen.findByText('VWAP distance')

    // Open the At-VWAP bucket → its accordion + the VWAP-dist table mount.
    fireEvent.click(screen.getByRole('button', { name: /At VWAP/ }))
    expect(screen.getByText('VWAP dist')).toBeTruthy() // the table's column header

    // Click the trade row → the read-only sheet opens for that trade.
    const tableRow = container.querySelector('tbody tr')
    expect(tableRow).not.toBeNull()
    fireEvent.click(tableRow!)
    expect(await screen.findByText('AAPL')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Close → the sheet unmounts; the tab stays.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Spec §J invariant 14 (see the audit map in
  // src/core/technicals/__tests__/section6-invariants.test.ts): filter-bar state
  // (TechnicalsTab useState) and accordion state (useBucketBand) are independent,
  // so expanding/collapsing a band must not reset the filter. The ticker filter is
  // renderer-side (no refetch on change), so its value is pure filter-bar state.
  it('(inv 14) expanding/collapsing a band preserves the filter-bar state', async () => {
    render(<TechnicalsTab />)
    await screen.findByText('VWAP distance')

    const ticker = screen.getByPlaceholderText('Ticker') as HTMLInputElement
    fireEvent.change(ticker, { target: { value: 'TEST' } })
    expect(ticker.value).toBe('TEST')

    // Expand a VWAP bucket → the filter must survive.
    fireEvent.click(screen.getByRole('button', { name: /At VWAP/ }))
    expect(ticker.value).toBe('TEST')

    // Collapse it → still preserved.
    fireEvent.click(screen.getByRole('button', { name: /At VWAP/ }))
    expect(ticker.value).toBe('TEST')
  })
})

describe('TechnicalsTab — Section 4 (EMA) integration', () => {
  it('renders the EMA distance band + 9/20 crossover strip once data loads', async () => {
    render(<TechnicalsTab />)
    expect(await screen.findByText('EMA distance')).toBeTruthy()
    // The crossover strip is the EMA band's own surface (no VWAP analog).
    expect(screen.getByText('9/20 stacking')).toBeTruthy()
    expect(screen.getByText('Stacked')).toBeTruthy()
    expect(screen.getByText('Broken')).toBeTruthy()
  })

  it('drills an EMA bucket → table row → TradeDetailSheet, then closes', async () => {
    const { container } = render(<TechnicalsTab />)
    await screen.findByText('EMA distance')

    // The seeded row sits at the DEFAULT ema9_dist_pct (-1.0) → the Below-9-EMA
    // bucket. Open it → its accordion + the EMA-dist table mount.
    fireEvent.click(screen.getByRole('button', { name: /Below 9 EMA/ }))
    expect(screen.getByText('EMA 9 dist')).toBeTruthy() // the table's column header

    // Click the trade row → the read-only sheet opens for that trade.
    const tableRow = container.querySelector('tbody tr')
    expect(tableRow).not.toBeNull()
    fireEvent.click(tableRow!)
    expect(await screen.findByText('AAPL')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Close → the sheet unmounts; the tab stays.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('TechnicalsTab — Section 5 (Combined Reads) integration', () => {
  it('renders the aligned/misaligned comparison and drills a cell to the sheet', async () => {
    const { container } = render(<TechnicalsTab />)
    expect(await screen.findByText('Combined signal reads')).toBeTruthy()
    expect(screen.getByText('Full alignment')).toBeTruthy()
    expect(screen.getByText('Any misalignment')).toBeTruthy()

    // The seeded row is MACD-positive and above VWAP but BELOW the 9 EMA (DEFAULT
    // ema9_dist -1.0), so it lands in Any misalignment. Open it → drill the trade.
    fireEvent.click(screen.getByRole('button', { name: /Any misalignment/ }))
    const tableRow = container.querySelector('tbody tr')
    expect(tableRow).not.toBeNull()
    fireEvent.click(tableRow!)
    expect(await screen.findByText('AAPL')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Close → the sheet unmounts; the tab stays.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

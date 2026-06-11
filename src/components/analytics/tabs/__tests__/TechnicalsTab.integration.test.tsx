import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import TechnicalsTab from '../TechnicalsTab'

// Integration test for the full Technicals tab through Section 3 (VWAP). The tab
// fetches via ipc.listTradesWithTechnicals on mount and drills into ipc.getTrade
// for the detail sheet — both mocked (F2.1 pattern). useThemeMode is mocked to a
// fixed dark theme so VwapDistanceBand's chartColors lookup is hermetic; the rest
// of the module is preserved.
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
})

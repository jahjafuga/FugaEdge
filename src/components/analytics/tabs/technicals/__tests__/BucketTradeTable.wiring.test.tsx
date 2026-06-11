import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { makeRow, makeCompleteSnapshot } from '@/test/fixtures/technicals'
import { makeTrade } from '@/test/fixtures/trade'
import BucketTradeTable from '../BucketTradeTable'
import { macdLineColumn } from '../distanceColumns'

// Wiring tests (F6 phase 3/3) — the row-click → read-only TradeDetailSheet
// drill-through that BucketTradeTable's header comment deferred to "5b.2". The
// sheet's only data dependency is ipc.getTrade; mock it (F2.1's pattern) so the
// rows can open it without a real backend. Indicator values come from the row's
// technicals (forwarded as technicalsHint), NOT getTrade — so the sheet's MACD
// line reads the clicked row's snapshot. Each sheet-mounting test settles the
// async load (findByText('AAPL')) to keep React updates inside act.
const { getTradeSpy } = vi.hoisted(() => ({ getTradeSpy: vi.fn() }))
vi.mock('@/lib/ipc', () => ({ ipc: { getTrade: getTradeSpy } }))

function row(
  id: number,
  technicals = makeCompleteSnapshot(),
): TradeWithTechnicalsRow {
  return makeRow({ id, net_pnl: 100, technicals })
}

function renderTable(
  rows: TradeWithTechnicalsRow[],
  timeframe: '1m' | '5m' = '1m',
) {
  return render(
    <BucketTradeTable
      rows={rows}
      timeframe={timeframe}
      distanceColumn={macdLineColumn}
    />,
  )
}

beforeEach(() => {
  getTradeSpy.mockReset()
  getTradeSpy.mockResolvedValue(makeTrade())
})

describe('BucketTradeTable — row-click → TradeDetailSheet (wiring)', () => {
  it('renders no sheet until a row is clicked', () => {
    renderTable([row(7)])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the sheet for the clicked row and forwards its trade_id', async () => {
    const { container } = renderTable([row(7)])
    fireEvent.click(container.querySelectorAll('tbody tr')[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(getTradeSpy).toHaveBeenCalledWith({ trade_id: 7 })
    await screen.findByText('AAPL') // settle the async load
  })

  it("forwards the clicked row's technicals to the sheet", async () => {
    const { container } = renderTable([
      row(7, makeCompleteSnapshot({ macd_line: 0.123 })),
    ])
    fireEvent.click(container.querySelectorAll('tbody tr')[0])
    // The sheet's Indicators read technicalsHint; the MACD line shows 0.123 (no
    // leading +), distinct from the table cell's +0.123.
    expect(await screen.findByText('0.123')).toBeTruthy()
  })

  it('forwards the table timeframe to the sheet', async () => {
    const { container } = renderTable([row(7)], '5m')
    fireEvent.click(container.querySelectorAll('tbody tr')[0])
    expect(await screen.findByText('Indicators (5m)')).toBeTruthy()
  })

  it('closes the sheet when onClose fires', async () => {
    const { container } = renderTable([row(7)])
    fireEvent.click(container.querySelectorAll('tbody tr')[0])
    await screen.findByText('AAPL')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('switches the selected trade when a different row is clicked', async () => {
    const { container } = renderTable([row(7), row(8)])
    const rows = () => container.querySelectorAll('tbody tr')
    fireEvent.click(rows()[0])
    expect(getTradeSpy).toHaveBeenLastCalledWith({ trade_id: 7 })
    fireEvent.click(rows()[1])
    expect(getTradeSpy).toHaveBeenLastCalledWith({ trade_id: 8 })
    await screen.findByText('AAPL') // settle
  })

  it('opens the sheet when a focused row is activated with Enter', async () => {
    const { container } = renderTable([row(7)])
    fireEvent.keyDown(container.querySelectorAll('tbody tr')[0], { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    await screen.findByText('AAPL')
  })
})

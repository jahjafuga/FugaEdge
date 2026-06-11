import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMacdBuckets } from '@/core/technicals/macdBuckets'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import { makeTrade } from '@/test/fixtures/trade'
import MacdStateGrid from '../MacdStateGrid'

// Integration tests (F7) — the foundation arc's culmination. The grid-level
// characterization (c31e5e1) stops at table-mount; the BucketTradeTable wiring
// test drives table → sheet with synthetic rows. These render the REAL
// MacdStateGrid composition and run the full cross-layer flow end-to-end:
// bucket card → accordion → grid-resolved table → row-click → TradeDetailSheet.
//
// Real timers throughout: opening a bucket from clean is synchronous (the 210ms
// close/switch timers — covered at the grid layer in c31e5e1 — never fire here).
// ipc.getTrade is mocked (F2.1's pattern); the sheet's indicator values come from
// the clicked row's technicals (technicalsHint), so test 2 proves the data path.
const { getTradeSpy } = vi.hoisted(() => ({ getTradeSpy: vi.fn() }))
vi.mock('@/lib/ipc', () => ({ ipc: { getTrade: getTradeSpy } }))

// One classifiable trade in the posRising bucket (macd_positive && macd_rising on
// the 1m snapshot), carrying a distinctive macd_line for the data-flow assertion.
const POS_RISING_ROW = makeRow({
  id: 1,
  technicals: makeCompleteSnapshot({
    macd_positive: true,
    macd_rising: true,
    macd_line: 0.789,
  }),
})
const ROWS = [POS_RISING_ROW]
const STATS = computeMacdBuckets(ROWS, '1m')

function renderGrid() {
  return render(
    <MacdStateGrid stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

const posRisingCard = () =>
  screen.getByRole('button', { name: /Positive \+ Rising/ })

beforeEach(() => {
  getTradeSpy.mockReset()
  getTradeSpy.mockResolvedValue(makeTrade())
})

describe('MacdStateGrid — full cross-layer flow (integration)', () => {
  it('opens a bucket, drills into a row, shows the sheet, and closes it', async () => {
    const { container } = renderGrid()
    // Open posRising → its accordion + the grid-resolved table mount synchronously.
    fireEvent.click(posRisingCard())
    const row = container.querySelector('tbody tr')
    expect(row).not.toBeNull()

    // Click the row → the read-only sheet opens for that trade.
    fireEvent.click(row!)
    expect(await screen.findByText('AAPL')).toBeTruthy() // mocked trade loaded
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Close → the sheet unmounts; the grid stays.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('forwards the grid-resolved row technicals to the sheet (rowsForBucket → table → sheet)', async () => {
    const { container } = renderGrid()
    fireEvent.click(posRisingCard())
    fireEvent.click(container.querySelector('tbody tr')!)
    // The sheet's Indicators MACD line is the clicked row's macd_line (0.789, no
    // leading + — distinct from the table cell's +0.789), so it can only be there
    // if technicalsHint flowed grid → table → sheet through the real composition.
    expect(await screen.findByText('0.789')).toBeTruthy()
  })
})

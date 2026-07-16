import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { RoundTripExecution } from '@shared/import-types'
import { makeTrade } from '@/test/fixtures/trade'
import { makeCompleteSnapshot } from '@/test/fixtures/technicals'
import { TradeDetailSheet } from '../TradeDetailSheet'

// The sheet's only data dependency is ipc.getTrade — stub it with a hoisted spy
// so each test drives the 4 render states (loading / loaded / not_found / error)
// directly. Indicator values come from the technicalsHint PROP, not getTrade.
const { getTradeSpy } = vi.hoisted(() => ({ getTradeSpy: vi.fn() }))
vi.mock('@/lib/ipc', () => ({ ipc: { getTrade: getTradeSpy } }))

// A promise that never settles — pins the loading state for assertions.
const never = () => new Promise<never>(() => {})

function makeExec(i: number): RoundTripExecution {
  return {
    trade_id: 't1',
    order_id: `o${i}`,
    side: i % 2 === 0 ? 'B' : 'S',
    qty: 100,
    price: 5,
    time: '2026-05-20T13:30:00Z',
  }
}

function renderSheet(
  props: Partial<ComponentProps<typeof TradeDetailSheet>> = {},
) {
  const onClose = vi.fn()
  const utils = render(
    <TradeDetailSheet
      trade_id={1}
      technicalsHint={makeCompleteSnapshot()}
      timeframe="1m"
      onClose={onClose}
      {...props}
    />,
  )
  return { ...utils, onClose }
}

beforeEach(() => {
  getTradeSpy.mockReset()
  getTradeSpy.mockResolvedValue(makeTrade())
})

describe('TradeDetailSheet — read-only Technicals drill-through', () => {
  // a
  it('renders skeleton blocks while the fetch is pending', () => {
    getTradeSpy.mockReturnValue(never())
    renderSheet()
    // The sheet portals to document.body, so query inside the dialog rather
    // than RTL's (empty) container root.
    expect(screen.getByRole('dialog').querySelector('.skeleton')).toBeTruthy()
  })

  // b
  it('shows trade identity (symbol + date · entry time) once loaded', async () => {
    getTradeSpy.mockResolvedValue(makeTrade())
    renderSheet()
    expect(await screen.findByText('AAPL')).toBeTruthy()
    // Dave #16 — the subtitle gained the entry time after the date (same
    // source as the Round Trips OPEN column): 13:30Z on the fixture -> 09:30:00
    // Eastern.
    expect(screen.getByText('May 20 2026 · 09:30:00')).toBeTruthy()
  })

  // c
  it('shows "Trade not found" and no symbol when getTrade returns null', async () => {
    getTradeSpy.mockResolvedValue(null)
    renderSheet()
    expect(await screen.findByText('Trade not found')).toBeTruthy()
    expect(screen.queryByText('AAPL')).toBeNull()
  })

  // d
  it('shows an alert and a Retry button when getTrade rejects', async () => {
    getTradeSpy.mockRejectedValue(new Error('boom'))
    renderSheet()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  // e
  it('re-fires getTrade and returns to loading when Retry is clicked', async () => {
    const user = userEvent.setup()
    getTradeSpy.mockRejectedValueOnce(new Error('boom'))
    renderSheet()
    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(getTradeSpy).toHaveBeenCalledTimes(1)

    getTradeSpy.mockReturnValueOnce(never())
    await user.click(retry)
    expect(getTradeSpy).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog').querySelector('.skeleton')).toBeTruthy()
  })

  // f
  it('shows an "In Trash" badge when the trade is soft-deleted', async () => {
    getTradeSpy.mockResolvedValue(
      makeTrade({ deleted_at: '2026-06-09T00:00:00.000Z' }),
    )
    renderSheet()
    expect(await screen.findByText('In Trash')).toBeTruthy()
  })

  // g
  it('shows the Indicators empty state when technicalsHint is null', async () => {
    getTradeSpy.mockResolvedValue(makeTrade())
    renderSheet({ technicalsHint: null })
    expect(
      await screen.findByText('Indicators not available for this trade'),
    ).toBeTruthy()
  })

  // h
  it('renders "—" for a null distance while the VWAP value still shows', async () => {
    getTradeSpy.mockResolvedValue(makeTrade())
    renderSheet({
      technicalsHint: makeCompleteSnapshot({ vwap: 12.34, vwap_dist_pct: null }),
    })
    await screen.findByText('AAPL')
    const vwapRow = screen.getByText('VWAP').closest('div')!
    expect(within(vwapRow).getByText('12.34')).toBeTruthy()
    expect(within(vwapRow).getByText('—')).toBeTruthy()
  })

  // i
  it('shows 8 executions by default and expands to all 12', async () => {
    const user = userEvent.setup()
    getTradeSpy.mockResolvedValue(
      makeTrade({
        executions: Array.from({ length: 12 }, (_, i) => makeExec(i)),
      }),
    )
    renderSheet()
    await screen.findByText('AAPL')
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelectorAll('tbody tr')).toHaveLength(8)

    await user.click(screen.getByRole('button', { name: /show all 12/i }))
    expect(dialog.querySelectorAll('tbody tr')).toHaveLength(12)
  })

  // j
  it('reads indicators from the 1m slot when timeframe is 1m', async () => {
    getTradeSpy.mockResolvedValue(makeTrade())
    renderSheet({
      technicalsHint: makeCompleteSnapshot({ macd_line: 0.1 }, { macd_line: 0.5 }),
      timeframe: '1m',
    })
    await screen.findByText('AAPL')
    expect(screen.getByText('0.100')).toBeTruthy()
    expect(screen.queryByText('0.500')).toBeNull()
  })

  // k
  it('reads indicators from the 5m slot when timeframe is 5m', async () => {
    getTradeSpy.mockResolvedValue(makeTrade())
    renderSheet({
      technicalsHint: makeCompleteSnapshot({ macd_line: 0.1 }, { macd_line: 0.5 }),
      timeframe: '5m',
    })
    await screen.findByText('AAPL')
    expect(screen.getByText('0.500')).toBeTruthy()
    expect(screen.queryByText('0.100')).toBeNull()
  })

  // l
  it('fires onClose from Escape, backdrop click, and the close button', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet()
    await screen.findByText('AAPL')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('dialog').firstElementChild!)
    expect(onClose).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  // m — commission breakdown (sibling of the modal beat 7eebbb6)
  it('shows the commission breakdown when the trade carries a separate commission (Ocean One)', async () => {
    getTradeSpy.mockResolvedValue(makeTrade({ total_fees: 0.15, commission: 0.1 }))
    renderSheet()
    await screen.findByText('AAPL')
    // Commission is a SLICE of total_fees; Other fees = 0.15 - 0.10 = 0.05.
    // The `.` matches the middle-dot separator without an encoding dependency.
    expect(screen.getByText(/Commission \$0\.10 . Other fees \$0\.05/)).toBeTruthy()
  })

  // n — honest absence: NULL commission (DAS/Webull) shows no fabricated split
  it('shows NO commission breakdown when commission is null (DAS/Webull)', async () => {
    getTradeSpy.mockResolvedValue(makeTrade({ total_fees: 2, commission: null }))
    renderSheet()
    await screen.findByText('AAPL')
    expect(screen.queryByText(/Commission/)).toBeNull()
  })
})

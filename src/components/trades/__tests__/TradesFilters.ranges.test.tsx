// @vitest-environment jsdom
// v0.2.7 Feature 4, Commit 5 — the range filter gets an entry point.
//
// End to end through the REAL filter path, not by calling matchesRange directly:
// what a user types must narrow the actual list.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TradesFilters from '@/components/trades/TradesFilters'
import { applyTradesFilters, emptyFilters, type TradesFilterState } from '@/core/trades/tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

const BOOK: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'VEEE', net_pnl: 100, mae: -20 }),
  makeTrade({ id: 2, symbol: 'VEEE', net_pnl: -50, mae: null }),
  makeTrade({ id: 3, symbol: 'AAPL', net_pnl: 25, mae: null }),
]
const NUMERIC = [
  { id: 'net_pnl', label: 'Net P&L' },
  { id: 'mae', label: 'MAE' },
]

function harness(numericColumns = NUMERIC) {
  let state: TradesFilterState = emptyFilters()
  const onChange = vi.fn((next: TradesFilterState) => {
    state = next
    rerender()
  })
  const ui = () => (
    <TradesFilters filters={state} onChange={onChange} trades={BOOK} numericColumns={numericColumns} />
  )
  const { rerender: r } = render(ui())
  function rerender() { r(ui()) }
  return { get state() { return state }, rerender }
}

describe('range inputs', () => {
  it('T24 typing a min filters the rows through the real filter path', () => {
    const h = harness()
    fireEvent.change(screen.getByLabelText('Net P&L minimum'), { target: { value: '50' } })
    expect(applyTradesFilters(BOOK, h.state).map((t) => t.id)).toEqual([1])
  })

  it('T26 a visible column has inputs, and they start empty', () => {
    harness()
    expect(screen.getByTestId('range-net_pnl')).toBeTruthy()
    expect((screen.getByLabelText('Net P&L minimum') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('MAE maximum') as HTMLInputElement).value).toBe('')
  })

  it('T25 a HIDDEN column contributes no inputs', () => {
    harness([{ id: 'net_pnl', label: 'Net P&L' }]) // mae hidden
    expect(screen.getByTestId('range-net_pnl')).toBeTruthy()
    expect(screen.queryByTestId('range-mae')).toBeNull()
    expect(screen.queryByLabelText('MAE minimum')).toBeNull()
  })

  it('T27 RESET clears ranges along with the existing filters', () => {
    const h = harness()
    fireEvent.change(screen.getByLabelText('Net P&L minimum'), { target: { value: '50' } })
    expect(Object.keys(h.state.ranges)).toContain('net_pnl')
    fireEvent.click(screen.getByText('Clear'))
    expect(h.state.ranges).toEqual({})
    expect(applyTradesFilters(BOOK, h.state)).toHaveLength(3)
  })

  it('T28 a range on a MOSTLY-NULL column narrows to the populated rows', () => {
    // MAE is present on one of three here, mirroring its 14% real coverage.
    const h = harness()
    fireEvent.change(screen.getByLabelText('MAE minimum'), { target: { value: '-100' } })
    const out = applyTradesFilters(BOOK, h.state)
    expect(out.map((t) => t.id)).toEqual([1]) // the only measured row
    expect(out).not.toHaveLength(0) // and it did not empty the table by accident
  })

  it('T29 STAND-DOWN: with nothing entered the list is untouched', () => {
    const h = harness()
    expect(applyTradesFilters(BOOK, h.state).map((t) => t.id)).toEqual([1, 2, 3])
  })
})

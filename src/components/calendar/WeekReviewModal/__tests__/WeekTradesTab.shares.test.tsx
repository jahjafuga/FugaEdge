// @vitest-environment jsdom
//
// Dave #15 — ONE SHARES SEMANTIC, the week twin. WeekTradesTab's shared
// TradeRow rendered shares_bought + shares_sold (2x position) since birth
// (a108d42). One TradeRow serves BOTH week views — the symbol-grouped
// expansion and the chronological flat table — so one fix covers both;
// this suite asserts through each view anyway to pin that routing.

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'
import WeekTradesTab from '../WeekTradesTab'

const noop = vi.fn()

// Dave's 08:34 fixture — 100/100 @ 8.46 -> 8.54, +$8.01.
const DAVE_0834 = makeTrade({
  id: 1,
  date: '2026-07-10',
  symbol: 'GDHG',
  open_time: '2026-07-10T12:34:00.000Z',
  close_time: '2026-07-10T12:36:00.000Z',
  shares_bought: 100,
  avg_buy_price: 8.46,
  shares_sold: 100,
  avg_sell_price: 8.54,
  gross_pnl: 8.01,
  total_fees: 0,
  net_pnl: 8.01,
})

function renderTab() {
  render(<WeekTradesTab trades={[DAVE_0834]} selectedTradeId={null} onSelectTrade={noop} />)
}

describe('WeekTradesTab — SHARES = position size through the shared TradeRow (Dave #15)', () => {
  it('(2a) grouped view: expanding the symbol shows 100, NOT 200, with the legs title', () => {
    renderTab()
    // Groups render collapsed — expand GDHG first.
    fireEvent.click(screen.getByRole('button', { name: /GDHG/ }))
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.queryByText('200')).toBeNull()
    expect(screen.getByTitle('Bought 100 · Sold 100')).toBeTruthy()
  })

  it('(2b) chronological view: the same TradeRow renders 100 there too', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Chronological' }))
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.queryByText('200')).toBeNull()
    expect(screen.getByTitle('Bought 100 · Sold 100')).toBeTruthy()
  })
})

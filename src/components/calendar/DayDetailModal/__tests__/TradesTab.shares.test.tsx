// @vitest-environment jsdom
//
// Dave #15 — ONE SHARES SEMANTIC. The day tab's Shares column rendered
// shares_bought + shares_sold since birth (bc3c4f5) — 2x the position for
// every closed trip. djsevans87's screenshots caught it: his 08:34 trade
// (100 @ 8.46 -> 8.54, +$8.01) showed 200. The fix renders the metrics
// layer's own pinned convention — position = Math.max(shares_bought,
// shares_sold) (metrics.ts:234, avgShareSize.ts) — with the removed legs
// one hover away via title="Bought N · Sold M".
//
// The DELIBERATE both-legs volume metric (computeDayMetrics.totalShares ->
// the day Overview "Shares traded" card) keeps its sum — pinned here so
// the fix provably didn't leak into the volume semantics.

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'
import { computeDayMetrics } from '@/core/analytics/day'
import TradesTab from '../TradesTab'

const noop = vi.fn()

// Dave's 08:34 Break Pivot: 100 bought / 100 sold, 8.46 -> 8.54, +$8.01.
const DAVE_0834 = makeTrade({
  id: 1,
  date: '2026-07-10',
  open_time: '2026-07-10T12:34:00.000Z', // 08:34 Eastern (EDT)
  close_time: '2026-07-10T12:36:00.000Z',
  shares_bought: 100,
  avg_buy_price: 8.46,
  shares_sold: 100,
  avg_sell_price: 8.54,
  gross_pnl: 8.01,
  total_fees: 0,
  net_pnl: 8.01,
})

function renderTab(trades = [DAVE_0834]) {
  render(<TradesTab trades={trades} selectedTradeId={null} onSelectTrade={noop} />)
}

describe('DayDetailModal TradesTab — SHARES = position size (Dave #15)', () => {
  it('(1) a 100-share closed trip renders 100, NOT the doubled 200', () => {
    renderTab()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.queryByText('200')).toBeNull()
  })

  it('(4a) equal legs still carry the legs title — uniform affordance', () => {
    renderTab()
    const cell = screen.getByTitle('Bought 100 · Sold 100')
    expect(cell.textContent).toContain('100')
  })

  it('(4b) unequal legs render the max with both legs in the title', () => {
    renderTab([
      makeTrade({
        id: 2,
        date: '2026-07-10',
        shares_bought: 100,
        shares_sold: 50,
        is_open: true,
        close_time: null,
      }),
    ])
    // max(100, 50) = 100 — never the old sum (150).
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.queryByText('150')).toBeNull()
    expect(screen.getByTitle('Bought 100 · Sold 50')).toBeTruthy()
  })

  it('(6) VOLUME SEMANTICS PRESERVED: computeDayMetrics.totalShares stays bought+sold (200) on the same fixture', () => {
    const m = computeDayMetrics({ date: '2026-07-10', trades: [DAVE_0834], exitDeltas: [] })
    expect(m.totalShares).toBe(200)
  })
})

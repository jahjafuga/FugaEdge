// @vitest-environment jsdom
//
// Dave #15 — ONE SHARES SEMANTIC. The dashboard's latest-session table
// carried the same BOUGHT / SOLD quantity pair as All Round Trips; it
// collapses to the same single SHARES column (position = max of legs,
// title carries both legs). BUY AVG / SELL AVG stay.

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { LatestSession } from '@shared/dashboard-types'
import LatestSessionTable from '../LatestSessionTable'

// Dave's 08:34 fixture — 100/100 @ 8.46 -> 8.54, +$8.01.
const SESSION: LatestSession = {
  date: '2026-07-10',
  net_pnl: 8.01,
  gross_pnl: 8.01,
  total_fees: 0,
  trade_count: 1,
  winners: 1,
  losers: 0,
  trades: [
    {
      id: 1,
      symbol: 'GDHG',
      side: 'long',
      shares_bought: 100,
      avg_buy_price: 8.46,
      shares_sold: 100,
      avg_sell_price: 8.54,
      total_fees: 0,
      net_pnl: 8.01,
      playbook_name: null,
      playbook_tier: null,
      confidence: null,
    },
  ],
}

describe('LatestSessionTable — the BOUGHT+SOLD collapse (Dave #15)', () => {
  it('(5) one SHARES header (pair gone, avgs intact); the cell shows the position with the legs title', () => {
    render(<LatestSessionTable session={SESSION} today="2026-07-11" />)

    const headers = Array.from(document.querySelectorAll('thead th')).map(
      (el) => el.textContent?.trim() ?? '',
    )
    expect(headers.filter((h) => h === 'Shares')).toHaveLength(1)
    expect(headers).not.toContain('Bought')
    expect(headers).not.toContain('Sold')
    expect(headers).toContain('Buy avg')
    expect(headers).toContain('Sell avg')

    const cell = screen.getByTitle('Bought 100 · Sold 100')
    expect(cell.textContent).toContain('100')
    expect(screen.queryByText('200')).toBeNull()
  })
})

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TradingCoachCard from '../TradingCoachCard'
import { runDayOfWeek } from '@/core/insights/rules'

// RED#e — the strongest-day insight must render with the positive (green) icon,
// not the red warning. We pull the actual strongest-day insight out of
// runDayOfWeek (its tone is the thing the bug got wrong) and render the Coach
// with ONLY that row, so a stray red elsewhere can't mask the regression.
// 2026-06-01 = Monday (best), 2026-06-03 = Wednesday (worst).
function strongestDayInsight() {
  const trades = [
    ...Array.from({ length: 29 }, (_, i) => mkTrade('2026-06-01', i === 0 ? 1280 : 0, 6000 + i)),
    ...Array.from({ length: 9 }, (_, i) => mkTrade('2026-06-03', i === 0 ? -47 : 0, 7000 + i)),
  ]
  const out = [runDayOfWeek({ trades, sentimentByDate: new Map(), disciplineStreak: 0 })].flat()
  return out.find((i) => /strongest day/.test(i?.title ?? ''))
}

import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
function mkTrade(date: string, net_pnl: number, id: number): TradeListRow {
  return makeTrade({
    id,
    date,
    symbol: 'AAA',
    net_pnl,
    open_time: `${date}T13:35:00.000Z`,
    close_time: `${date}T13:45:00.000Z`,
  })
}

describe('TradingCoachCard — strongest-day icon (RED#e)', () => {
  it('renders the positive (green) treatment, not the red warning', () => {
    const strongest = strongestDayInsight()
    expect(strongest).toBeDefined()

    const { container } = render(<TradingCoachCard insights={[strongest!]} />)
    // The row's tone icon + metric chip carry the win color, never the loss color.
    expect(container.querySelector('.text-win')).not.toBeNull()
    expect(container.querySelector('.text-loss')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { holdTimeSeconds, pnlGainPct } from '../tradeMetrics'

describe('holdTimeSeconds', () => {
  it('seconds between open and close', () => {
    expect(holdTimeSeconds({
      open_time: '2026-07-13T13:30:00Z', close_time: '2026-07-13T14:00:00Z',
    })).toBe(1800)
  })
  it('an OPEN trade has an unknown hold, not a zero one', () => {
    expect(holdTimeSeconds({ open_time: '2026-07-13T13:30:00Z', close_time: null })).toBeNull()
  })
  it('unparseable timestamps -> null, never NaN', () => {
    const r = holdTimeSeconds({ open_time: 'nonsense', close_time: '2026-07-13T14:00:00Z' })
    expect(r).toBeNull()
    expect(Number.isNaN(r as number)).toBe(false)
  })
  it('a close BEFORE the open is corrupt, not a negative duration', () => {
    expect(holdTimeSeconds({
      open_time: '2026-07-13T14:00:00Z', close_time: '2026-07-13T13:30:00Z',
    })).toBeNull()
  })
})

describe('pnlGainPct', () => {
  const base = {
    side: 'long' as const, avg_buy_price: 10, avg_sell_price: 11,
    shares_bought: 100, shares_sold: 100, net_pnl: 95,
  }
  it('net over capital committed, as a percentage', () => {
    // 95 / (10 * 100) = 9.5%
    expect(pnlGainPct(base)).toBeCloseTo(9.5, 6)
  })
  it('a SHORT uses the sell price as its entry', () => {
    const short = { ...base, side: 'short' as const, avg_sell_price: 20, net_pnl: 100 }
    expect(pnlGainPct(short)).toBeCloseTo((100 / (20 * 100)) * 100, 6)
  })
  it('a loser is negative', () => {
    expect(pnlGainPct({ ...base, net_pnl: -50 })).toBeCloseTo(-5, 6)
  })
  it('zero entry price -> null, never Infinity', () => {
    const r = pnlGainPct({ ...base, avg_buy_price: 0 })
    expect(r).toBeNull()
    expect(Number.isFinite(r as number)).toBe(false)
  })
  it('zero position size -> null', () => {
    expect(pnlGainPct({ ...base, shares_bought: 0, shares_sold: 0 })).toBeNull()
  })
})

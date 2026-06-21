// Compare v2 Time-of-Day quad — per-hour aggregation. Pins the Eastern-hour
// bucketing, the four metrics, and the honesty cases: profit_factor null when an
// hour has no losers (NOT Infinity), win_rate null when no decided trade.
//
// open_time is UTC; utcToEasternParts converts to US-Eastern. These fixtures use
// MAY dates (EDT = UTC-4), so 13:30Z -> 09:30 ET (hour 9), 14:30Z -> hour 10.

import { describe, it, expect } from 'vitest'
import {
  bucketTradesByHour,
  computeHourlyComparison,
  type TradeForHourly,
} from '../hourly'

function t(over: Partial<TradeForHourly>): TradeForHourly {
  return { date: '2026-05-01', open_time: '2026-05-01T13:30:00Z', net_pnl: 0, ...over }
}

describe('bucketTradesByHour', () => {
  it('groups by Eastern hour with net / count / win_rate / profit_factor', () => {
    const buckets = bucketTradesByHour([
      t({ open_time: '2026-05-01T13:30:00Z', net_pnl: 100 }), // hr 9, win
      t({ open_time: '2026-05-01T13:45:00Z', net_pnl: -40 }), // hr 9, loss
      t({ open_time: '2026-05-01T14:30:00Z', net_pnl: 50 }), // hr 10, win
    ])
    const h9 = buckets.get(9)!
    expect(h9.trade_count).toBe(2)
    expect(h9.net_pnl).toBe(60)
    expect(h9.win_rate).toBe(0.5) // 1 win / (1 win + 1 loss)
    expect(h9.profit_factor).toBeCloseTo(2.5, 6) // 100 / |−40|
    expect(buckets.get(10)!.trade_count).toBe(1)
  })

  it('profit_factor is null when an hour has winners but NO losers (no Infinity)', () => {
    const h9 = bucketTradesByHour([
      t({ open_time: '2026-05-01T13:30:00Z', net_pnl: 100 }),
      t({ open_time: '2026-05-01T13:45:00Z', net_pnl: 50 }),
    ]).get(9)!
    expect(h9.profit_factor).toBeNull() // no losses -> null, NOT Infinity
    expect(Number.isFinite(h9.profit_factor as number)).toBe(false)
    expect(h9.win_rate).toBe(1)
  })

  it('win_rate is null when no decided trade (all scratches)', () => {
    const h9 = bucketTradesByHour([t({ net_pnl: 0 })]).get(9)!
    expect(h9.win_rate).toBeNull()
    expect(h9.profit_factor).toBeNull()
    expect(h9.trade_count).toBe(1)
  })
})

describe('computeHourlyComparison', () => {
  it('zips A and B by hour with inclusive range filtering + zero-padded label', () => {
    const rows = computeHourlyComparison(
      [
        t({ date: '2026-05-01', open_time: '2026-05-01T13:30:00Z', net_pnl: 100 }), // A, hr 9
        t({ date: '2026-04-01', open_time: '2026-04-01T13:30:00Z', net_pnl: -20 }), // B, hr 9
      ],
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
    )
    const h9 = rows.find((r) => r.hour === 9)!
    expect(h9.label).toBe('09:00')
    expect(h9.a.net_pnl).toBe(100)
    expect(h9.a.trade_count).toBe(1)
    expect(h9.b.net_pnl).toBe(-20)
    expect(h9.b.trade_count).toBe(1)
  })

  it('an hour present in only one period reads as empty (0 trades) on the other', () => {
    const rows = computeHourlyComparison(
      [t({ date: '2026-05-01', open_time: '2026-05-01T14:30:00Z', net_pnl: 30 })], // A only, hr 10
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
    )
    const h10 = rows.find((r) => r.hour === 10)!
    expect(h10.a.trade_count).toBe(1)
    expect(h10.b.trade_count).toBe(0)
    expect(h10.b.net_pnl).toBe(0)
    expect(h10.b.profit_factor).toBeNull()
  })
})

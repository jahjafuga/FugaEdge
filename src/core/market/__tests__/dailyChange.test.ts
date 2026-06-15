import { describe, it, expect } from 'vitest'
import {
  prevCloseFor,
  dailyChangePct,
  dailyChangeForTrade,
  type DailyBar,
  type DailyChangeTrade,
} from '../dailyChange'

// A symbol's daily bars, sorted ascending by date. June 5 2026 = Fri, June 8 =
// Mon (the weekend gap), so the prior TRADING day before Mon is Fri.
const BARS: DailyBar[] = [
  { date: '2026-06-03', close: 9.0 },
  { date: '2026-06-04', close: 10.0 },
  { date: '2026-06-05', close: 10.5 }, // Friday
  { date: '2026-06-08', close: 11.0 }, // Monday (weekend gap)
]

describe('prevCloseFor', () => {
  it('returns the PRIOR trading day close — not the trade-day bar, not a future bar', () => {
    expect(prevCloseFor('2026-06-04', BARS)).toBe(9.0)
    expect(prevCloseFor('2026-06-05', BARS)).toBe(10.0)
  })

  it('returns null when the trade date is the earliest bar (no prior)', () => {
    expect(prevCloseFor('2026-06-03', BARS)).toBeNull()
  })

  it('returns null when the trade date precedes every bar', () => {
    expect(prevCloseFor('2026-06-01', BARS)).toBeNull()
  })

  it('resolves a weekend/holiday gap to the last TRADING day before it (Mon → Fri)', () => {
    expect(prevCloseFor('2026-06-08', BARS)).toBe(10.5) // Friday's close, not "Sunday"
  })

  it('a trade date with no exact bar resolves to the last bar strictly before it', () => {
    expect(prevCloseFor('2026-06-07', BARS)).toBe(10.5) // Sat → Friday's close
  })
})

describe('dailyChangePct', () => {
  it('normal: entry 11.20 vs prevClose 10.00 → +12.0', () => {
    expect(dailyChangePct(11.2, 10.0)).toBeCloseTo(12.0, 6)
  })

  it('negative: entry 9.00 vs prevClose 10.00 → −10.0', () => {
    expect(dailyChangePct(9.0, 10.0)).toBeCloseTo(-10.0, 6)
  })

  it('a Ross-Cameron-style +20%: entry 6.00 vs prevClose 5.00 → +20.0', () => {
    expect(dailyChangePct(6.0, 5.0)).toBeCloseTo(20.0, 6)
  })

  it('guard: prevClose <= 0 is uncomputable → null (no fabrication)', () => {
    expect(dailyChangePct(11.2, 0)).toBeNull()
    expect(dailyChangePct(11.2, -5)).toBeNull()
  })

  it('guard: a non-finite input → null', () => {
    expect(dailyChangePct(Number.NaN, 10)).toBeNull()
    expect(dailyChangePct(11.2, Number.NaN)).toBeNull()
  })
})

describe('dailyChangeForTrade', () => {
  // date 06-05 → prevClose is the 06-04 bar (10.00), so long 11.20 → +12.0 and
  // short 9.00 → −10.0.
  const base: Omit<DailyChangeTrade, 'side'> = {
    avg_buy_price: 11.2,
    avg_sell_price: 9.0,
    date: '2026-06-05',
  }

  it('long uses the buy price vs the prior close (11.20 vs 10.00 → +12.0)', () => {
    expect(dailyChangeForTrade({ ...base, side: 'long' }, BARS)).toBeCloseTo(12.0, 6)
  })

  it('short uses the sell price vs the prior close (9.00 vs 10.00 → −10.0)', () => {
    expect(dailyChangeForTrade({ ...base, side: 'short' }, BARS)).toBeCloseTo(-10.0, 6)
  })

  it('null when there is no prior bar (earliest date)', () => {
    expect(dailyChangeForTrade({ ...base, side: 'long', date: '2026-06-03' }, BARS)).toBeNull()
  })
})

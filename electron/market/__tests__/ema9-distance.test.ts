import { beforeEach, describe, expect, it, vi } from 'vitest'

// computeEma9Distance + backfillAllEma9Distances + runLaunchEma9Backfill live in
// intraday.ts, which imports the db/repo/settings layers (better-sqlite3) at
// module load. Mock those so the module loads in vitest without a real
// connection (the mock-SQL-contract pattern from intraday-refresh-timeout.test).
// The pure compute uses none of them.
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
const h = vi.hoisted(() => ({
  fakeDb: { prepare: () => ({ all: () => [] as unknown[], get: () => undefined, run: () => {} }) } as {
    prepare: () => { all: () => unknown[]; get: () => unknown; run: () => void }
  },
  intradayRow: null as { bars: Bar[] } | null,
  setEma9: vi.fn(),
}))

vi.mock('../../db/database', () => ({ openDatabase: () => h.fakeDb }))
vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))
vi.mock('../repo', () => ({
  getIntradayRow: () => h.intradayRow,
  setTradeEma9Distance: (id: number, pct: number | null) => h.setEma9(id, pct),
  setTradeMaeMfe: () => {},
  upsertIntradayRow: () => {},
  intradayPairsNeedingFetch: () => ({ pairs: [], cooldownSkipped: 0 }),
}))

import { computeEma9Distance, runLaunchEma9Backfill } from '../intraday'
import { ema } from '../../lib/ema'

// 1-minute bars starting at epoch ms 0, 60000, 120000, ... close = the value.
const mkBar = (i: number, c: number): Bar => ({ t: i * 60000, o: c, h: c, l: c, c, v: 100 })
const CLOSES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
const BARS = CLOSES.map((c, i) => mkBar(i, c))
const ENTRY_OT = '1970-01-01T00:10:00.000Z' // bar index 10 (t=600000) → cutoffIdx 10
const longTrade = (over: Record<string, unknown> = {}) => ({
  side: 'long' as const,
  avg_buy_price: 20,
  avg_sell_price: 0,
  open_time: ENTRY_OT,
  ...over,
})

// expected via the SAME ema helper computeEma9Distance uses → byte-identical.
function expectedPct(closesUpTo: number[], entry: number): number {
  const series = ema(closesUpTo, 9)
  const last = series[series.length - 1] as number
  return ((entry - last) / last) * 100
}
const EXPECTED = expectedPct(CLOSES.slice(0, 11), 20) // closes idx 0..10, entry 20

describe('computeEma9Distance (pure) — coverage gap close', () => {
  it('returns the signed % distance from the 9 EMA at the entry bar', () => {
    expect(computeEma9Distance(longTrade(), BARS)).toBeCloseTo(EXPECTED, 10)
  })
  it('null when there are no bars', () => {
    expect(computeEma9Distance(longTrade(), [])).toBeNull()
    expect(computeEma9Distance(longTrade(), null)).toBeNull()
  })
  it('null when fewer than 9 bars precede the entry (cutoffIdx < 8)', () => {
    expect(
      computeEma9Distance(longTrade({ open_time: '1970-01-01T00:05:00.000Z' }), BARS),
    ).toBeNull()
  })
  it('null when the entry time is unparseable', () => {
    expect(computeEma9Distance(longTrade({ open_time: 'not-a-date' }), BARS)).toBeNull()
  })
  it('null when the entry price is <= 0', () => {
    expect(
      computeEma9Distance(longTrade({ avg_buy_price: 0, avg_sell_price: 0 }), BARS),
    ).toBeNull()
  })
})

describe('runLaunchEma9Backfill (launch arm) → backfillAllEma9Distances', () => {
  beforeEach(() => {
    h.setEma9.mockClear()
    h.intradayRow = { bars: BARS }
  })

  it('writes the computed pct for a trade with bars + a null value', () => {
    h.fakeDb = {
      prepare: () => ({
        all: () => [
          { id: 1, symbol: 'AAA', date: '2026-06-09', side: 'long', avg_buy_price: 20, avg_sell_price: 0, open_time: ENTRY_OT, entry_ema9_distance_pct: null },
        ],
        get: () => undefined,
        run: () => {},
      }),
    }
    runLaunchEma9Backfill()
    expect(h.setEma9).toHaveBeenCalledTimes(1)
    expect(h.setEma9.mock.calls[0][0]).toBe(1)
    expect(h.setEma9.mock.calls[0][1]).toBeCloseTo(EXPECTED, 10)
  })

  it('is idempotent — does NOT write when the stored value already matches', () => {
    h.fakeDb = {
      prepare: () => ({
        all: () => [
          { id: 1, symbol: 'AAA', date: '2026-06-09', side: 'long', avg_buy_price: 20, avg_sell_price: 0, open_time: ENTRY_OT, entry_ema9_distance_pct: EXPECTED },
        ],
        get: () => undefined,
        run: () => {},
      }),
    }
    runLaunchEma9Backfill()
    expect(h.setEma9).not.toHaveBeenCalled()
  })
})

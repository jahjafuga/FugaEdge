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

// ── EMA fix beat B — the warmup-union seed unification ─────────────────────
// The tile adopts the snapshot's exonerated convention
// (computeTradeTechnicals.ts:155-185): EMA seeded over the WARMUP-UNION
// closes, read at the entry bar; the day-only slice and the >=9-day-bar
// floor retire. No warmup present -> the union degrades to day-only, so
// every pre-existing case above stands byte-unchanged. The two ema()
// helpers (electron/lib, core/charts) are algorithmically identical
// (SMA seed, same recurrence — core/charts/ema.ts:10-13 documents the
// deliberate match), so the union window is the WHOLE unification.

// Prior-day warmup: 12 bars ending before the day session. Day bars (BARS)
// start at t=0, so warmup occupies negative-time buckets — strictly earlier,
// mirroring the real prior-day series.
const WARMUP_CLOSES = [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20.5, 20.2]
const WARMUP = WARMUP_CLOSES.map((c, i) => mkBar(i - WARMUP_CLOSES.length, c))

// The snapshot-formula expectation on the same inputs: ema over the union
// closes up to (and including) the entry bar, read at that bar.
function expectedUnionPct(dayClosesUpTo: number[], entry: number): number {
  const series = ema([...WARMUP_CLOSES, ...dayClosesUpTo], 9)
  const last = series[series.length - 1] as number
  return ((entry - last) / last) * 100
}

describe('computeEma9Distance — the unified warmup-union seed (beat B)', () => {
  it('(a) CONVERGENCE: with warmup + day bars, equals the snapshot formula on the same inputs', () => {
    const expected = expectedUnionPct(CLOSES.slice(0, 11), 20) // entry bar idx 10
    expect(computeEma9Distance(longTrade(), BARS, WARMUP)).toBeCloseTo(expected, 10)
  })

  it("(b) THE EARLY-SESSION CASE: an entry on the day's second bar computes from warmup (the old seed had no legal value)", () => {
    // open_time at t=60000 → day bar index 1; the old day-only floor
    // (cutoffIdx < 8) returned null — the 9/37 drift class, dead by
    // construction under the union.
    const expected = expectedUnionPct(CLOSES.slice(0, 2), 20)
    expect(
      computeEma9Distance(longTrade({ open_time: '1970-01-01T00:01:00.000Z' }), BARS, WARMUP),
    ).toBeCloseTo(expected, 10)
  })

  it("(c) HONEST NULL: no warmup AND insufficient day bars -> null (the snapshot's sufficiency rule, mirrored)", () => {
    // union = 6 closes < the 9-sample seed → the ema series is null at the
    // entry bar → null, never fabricated.
    expect(
      computeEma9Distance(longTrade({ open_time: '1970-01-01T00:05:00.000Z' }), BARS, []),
    ).toBeNull()
  })
})

describe('backfillAllEma9Distances — the tile heal rides the existing sweep (beat B)', () => {
  beforeEach(() => {
    h.setEma9.mockClear()
  })

  it('(d1) re-derives a stored stale (day-seed) value to the union value from CACHED bars', () => {
    const oldDaySeed = EXPECTED // the pre-unification stored value
    const unionValue = expectedUnionPct(CLOSES.slice(0, 11), 20)
    h.intradayRow = { bars: BARS, warmup_bars: WARMUP } as never
    h.fakeDb = {
      prepare: () => ({
        all: () => [
          { id: 7, symbol: 'AAA', date: '2026-06-09', side: 'long', avg_buy_price: 20, avg_sell_price: 0, open_time: ENTRY_OT, entry_ema9_distance_pct: oldDaySeed },
        ],
        get: () => undefined,
        run: () => {},
      }),
    }
    runLaunchEma9Backfill()
    expect(h.setEma9).toHaveBeenCalledTimes(1)
    expect(h.setEma9.mock.calls[0][0]).toBe(7)
    expect(h.setEma9.mock.calls[0][1]).toBeCloseTo(unionValue, 10)
  })

  it('(d2) idempotent under the new seed — a second sweep writes nothing', () => {
    const unionValue = expectedUnionPct(CLOSES.slice(0, 11), 20)
    h.intradayRow = { bars: BARS, warmup_bars: WARMUP } as never
    h.fakeDb = {
      prepare: () => ({
        all: () => [
          { id: 7, symbol: 'AAA', date: '2026-06-09', side: 'long', avg_buy_price: 20, avg_sell_price: 0, open_time: ENTRY_OT, entry_ema9_distance_pct: unionValue },
        ],
        get: () => undefined,
        run: () => {},
      }),
    }
    runLaunchEma9Backfill()
    expect(h.setEma9).not.toHaveBeenCalled()
  })

  it('(d3) uncached trades untouched — no write, no fetch attempted (a stored value is never erased by bar absence)', () => {
    h.intradayRow = null
    h.fakeDb = {
      prepare: () => ({
        all: () => [
          { id: 9, symbol: 'BBB', date: '2026-06-09', side: 'long', avg_buy_price: 20, avg_sell_price: 0, open_time: ENTRY_OT, entry_ema9_distance_pct: 3.21 },
        ],
        get: () => undefined,
        run: () => {},
      }),
    }
    runLaunchEma9Backfill()
    expect(h.setEma9).not.toHaveBeenCalled()
  })
})

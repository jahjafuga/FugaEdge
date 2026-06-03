import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { RoundTripExecution } from '@shared/import-types'
import type { IntradayBar } from '@shared/market-types'
// RED: module not implemented yet — this is the only unresolved import.
import { buildTradeMarkers } from '../buildTradeMarkers'

// ── Fixtures ───────────────────────────────────────────────────────────────
// 2026-05-14 13:30:00Z session anchor; one bar per minute. Bar timestamps are
// epoch ms (IntradayBar.t); fill .time is an ISO-8601 UTC string with a Z
// suffix, matching the Day 8.5 Commit B contract.
const BASE = Date.UTC(2026, 4, 14, 13, 30, 0)
const minute = (m: number): number => BASE + m * 60_000
const iso = (ms: number): string => new Date(ms).toISOString()

function bar(tMs: number, o: number, h: number, l: number, c: number, v: number): IntradayBar {
  return { t: tMs, o, h, l, c, v }
}

function exec(side: 'B' | 'S', qty: number, price: number, tMs: number): RoundTripExecution {
  return { trade_id: 't1', order_id: `${side}-${tMs}`, side, qty, price, time: iso(tMs) }
}

// buildTradeMarkers only reads `side` + `executions` (avg entry/exit are
// computed share-weighted FROM the fills, not the stored avg_* columns), so a
// minimal cast keeps each test readable without the ~40 unrelated TradeListRow
// fields.
function tradeOf(side: 'long' | 'short', executions: RoundTripExecution[]): TradeListRow {
  return { side, executions } as unknown as TradeListRow
}

// (a) one marker per fill, carrying exact price/side/qty/time ──────────────────
describe('buildTradeMarkers — one marker per fill', () => {
  it('emits exactly one marker per execution, never collapsed to one-per-trade', () => {
    const bars = [
      bar(minute(0), 10, 10.2, 9.9, 10.1, 1000),
      bar(minute(1), 10.1, 10.4, 10.0, 10.3, 1200),
      bar(minute(2), 10.3, 10.5, 10.2, 10.4, 800),
    ]
    const trade = tradeOf('long', [
      exec('B', 100, 10.05, minute(0)),
      exec('B', 300, 10.15, minute(1)),
      exec('S', 400, 10.4, minute(2)),
    ])

    const { markers } = buildTradeMarkers(trade, bars)

    expect(markers).toHaveLength(3)
    expect(markers.map((m) => m.price)).toEqual([10.05, 10.15, 10.4])
    expect(markers.map((m) => m.side)).toEqual(['B', 'B', 'S'])
    expect(markers.map((m) => m.qty)).toEqual([100, 300, 400])
    expect(markers.map((m) => m.time)).toEqual([minute(0), minute(1), minute(2)])
  })
})

// (b) entries vs exits distinguished by role ──────────────────────────────────
describe('buildTradeMarkers — entry vs exit role', () => {
  it('long trade: buys are entries, sells are exits', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10.1, 1000), bar(minute(1), 10.1, 10.4, 10, 10.3, 900)]
    const trade = tradeOf('long', [exec('B', 100, 10, minute(0)), exec('S', 100, 10.3, minute(1))])

    const { markers } = buildTradeMarkers(trade, bars)
    const kindBySide = Object.fromEntries(markers.map((m) => [m.side, m.kind]))

    expect(kindBySide.B).toBe('entry')
    expect(kindBySide.S).toBe('exit')
  })

  it('short trade: sells are entries, buys are exits', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10.1, 1000), bar(minute(1), 10.1, 10.4, 10, 9.8, 900)]
    const trade = tradeOf('short', [exec('S', 100, 10.1, minute(0)), exec('B', 100, 9.8, minute(1))])

    const { markers } = buildTradeMarkers(trade, bars)
    const kindBySide = Object.fromEntries(markers.map((m) => [m.side, m.kind]))

    expect(kindBySide.S).toBe('entry')
    expect(kindBySide.B).toBe('exit')
  })
})

// (c) marker size scales with fill quantity ───────────────────────────────────
describe('buildTradeMarkers — marker size scales with quantity', () => {
  it('a larger-qty fill yields a larger size value than a smaller-qty fill', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10.1, 1000), bar(minute(1), 10.1, 10.4, 10, 10.3, 900)]
    const trade = tradeOf('long', [exec('B', 50, 10, minute(0)), exec('B', 5000, 10.1, minute(1))])

    const { markers } = buildTradeMarkers(trade, bars)
    const small = markers.find((m) => m.qty === 50)!
    const big = markers.find((m) => m.qty === 5000)!

    expect(big.size).toBeGreaterThan(small.size)
  })
})

// (d) share-weighted average entry / exit levels ──────────────────────────────
describe('buildTradeMarkers — share-weighted average entry/exit', () => {
  it('long trade: avgEntry is the share-weighted mean of buys, avgExit of sells', () => {
    const bars = [
      bar(minute(0), 10, 11, 10, 10.8, 1000),
      bar(minute(1), 10.8, 11.2, 10.7, 11, 900),
      bar(minute(2), 11, 12.1, 11, 12, 800),
    ]
    const trade = tradeOf('long', [
      exec('B', 100, 10, minute(0)),
      exec('B', 300, 11, minute(1)), // entry = (100*10 + 300*11) / 400 = 10.75
      exec('S', 400, 12, minute(2)), // exit  = 12
    ])

    const { avgEntry, avgExit } = buildTradeMarkers(trade, bars)

    expect(avgEntry).toBeCloseTo(10.75, 6)
    expect(avgExit).toBeCloseTo(12, 6)
  })

  it('short trade: avgEntry is the weighted mean of sells, avgExit of buys', () => {
    const bars = [
      bar(minute(0), 20, 20.5, 19.5, 20.2, 1000),
      bar(minute(1), 20.2, 20.6, 19, 19.5, 900),
      bar(minute(2), 19.5, 19.6, 18.4, 18.5, 800),
    ]
    const trade = tradeOf('short', [
      exec('S', 200, 20, minute(0)),
      exec('S', 200, 21, minute(1)),   // entry = (200*20 + 200*21) / 400 = 20.5
      exec('B', 400, 18.5, minute(2)), // exit  = 18.5
    ])

    const { avgEntry, avgExit } = buildTradeMarkers(trade, bars)

    expect(avgEntry).toBeCloseTo(20.5, 6)
    expect(avgExit).toBeCloseTo(18.5, 6)
  })
})

// (e) per-fill hover payload: 9EMA distance + %-from-VWAP ──────────────────────
describe('buildTradeMarkers — per-fill hover payload (9EMA distance + VWAP%)', () => {
  it('ema9 distance mirrors entry_ema9_distance_pct: latest EMA9 point at-or-before the fill', () => {
    const bars = [
      bar(minute(0), 10, 10.2, 9.9, 10, 1000),
      bar(minute(1), 10, 10.3, 9.9, 10.1, 900),
      bar(minute(2), 10.1, 10.4, 10, 10.2, 800),
    ]
    const ema9 = [
      { time: minute(0), value: 10.0 },
      { time: minute(1), value: 10.5 }, // chosen: latest point with time <= fill epoch
      { time: minute(2), value: 11.0 },
    ]
    // Fill 20s after bar 1 — between bars, so the latest EMA9 point <= fill is minute(1).
    const trade = tradeOf('long', [exec('B', 100, 10.0, minute(1) + 20_000)])

    const { markers } = buildTradeMarkers(trade, bars, { ema9 })

    expect(markers[0].hover.ema9DistancePct).toBeCloseTo(((10.0 - 10.5) / 10.5) * 100, 6)
  })

  it('VWAP% uses the latest VWAP point at-or-before the fill', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10, 1000), bar(minute(1), 10, 10.3, 9.9, 10.1, 900)]
    const vwap = [
      { time: minute(0), value: 10.0 },
      { time: minute(1), value: 10.2 }, // chosen for a fill at minute(1)
    ]
    const trade = tradeOf('long', [exec('B', 100, 10.71, minute(1))])

    const { markers } = buildTradeMarkers(trade, bars, { vwap })

    expect(markers[0].hover.pctFromVwap).toBeCloseTo(((10.71 - 10.2) / 10.2) * 100, 6)
  })

  it('returns null hover stats when no EMA9/VWAP point precedes the fill', () => {
    const bars = [bar(minute(5), 10, 10.2, 9.9, 10, 1000)]
    const ema9 = [{ time: minute(9), value: 10.0 }] // entirely after the fill
    const vwap = [{ time: minute(9), value: 10.0 }]
    const trade = tradeOf('long', [exec('B', 100, 10.0, minute(5))])

    const { markers } = buildTradeMarkers(trade, bars, { ema9, vwap })

    expect(markers[0].hover.ema9DistancePct).toBeNull()
    expect(markers[0].hover.pctFromVwap).toBeNull()
  })
})

// (f) edge cases: snap-to-nearest, empty fills, single fill ────────────────────
describe('buildTradeMarkers — edge cases', () => {
  it('snaps a fill with no exact bar match to the nearest bar time', () => {
    // bars at 0s / 60s / 120s; fill at 100s -> nearest is 120s (|100-120|=20 < |100-60|=40)
    const bars = [
      bar(minute(0), 10, 10.2, 9.9, 10, 1000),
      bar(minute(1), 10, 10.3, 9.9, 10.1, 900),
      bar(minute(2), 10.1, 10.4, 10, 10.2, 800),
    ]
    const fillMs = minute(0) + 100_000
    const trade = tradeOf('long', [exec('B', 100, 10.1, fillMs)])

    const { markers } = buildTradeMarkers(trade, bars)

    expect(markers[0].time).toBe(minute(2))
  })

  it('returns no markers and null averages for an empty executions array', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10, 1000)]
    const trade = tradeOf('long', [])

    const result = buildTradeMarkers(trade, bars)

    expect(result.markers).toEqual([])
    expect(result.avgEntry).toBeNull()
    expect(result.avgExit).toBeNull()
  })

  it('handles a single-fill (still-open) trade: one entry marker, no exit average', () => {
    const bars = [bar(minute(0), 10, 10.2, 9.9, 10, 1000)]
    const trade = tradeOf('long', [exec('B', 100, 10.0, minute(0))])

    const { markers, avgEntry, avgExit } = buildTradeMarkers(trade, bars)

    expect(markers).toHaveLength(1)
    expect(markers[0].kind).toBe('entry')
    expect(avgEntry).toBeCloseTo(10.0, 6)
    expect(avgExit).toBeNull()
  })
})

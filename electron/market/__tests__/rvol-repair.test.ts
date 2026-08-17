// v0.2.7 Bug 1 — the deferred RVOL repair.
//
// MEASURED FAILURE this pins (live journal, 2026-08-17): 28 of 28 trades carry
// rvol NULL, every symbol IS cached, and NOT ONE trade date is present in its
// own daily_volumes map — each map ends exactly one trading day before the
// trade. Import asks Polygon for MIN(trade)-30 .. MAX(trade); on a same-day
// import that session's daily bar is not published yet, so daily_volumes[date]
// is undefined and rvolFor honestly returns null. backfillAllRvol is cache-only
// by contract, so it re-derives from the same short cache forever.
//
// Two layers under test in one file: the pure orchestrator (R1/R3/R4/R5) and
// the launch trigger (R2). The trigger cannot live in src/core — it reads the
// electron repo — so it is mocked here rather than split into a second file.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  repairMissingRvol,
  symbolsMissingTradeDates,
  type RvolCacheRow,
  type RvolTradeNeed,
} from '@/core/market/rvolRepair'

// ── fake book ───────────────────────────────────────────────────────────────
interface FakeTrade {
  id: number
  symbol: string
  date: string
  rvol: number | null
}

let trades: FakeTrade[] = []
const market = new Map<string, RvolCacheRow>()
/** What a later refetch would land for a symbol: the days the first request was
 *  too early to see. Keyed by symbol; consumed by the fake refresh. */
const wouldLand = new Map<string, { days: Record<string, number>; avg: number | null }>()
// vitest 1.x vi.fn takes the ARGS TUPLE first, then the return type.
const refetchSpy = vi.fn<[{ force?: boolean; symbols?: string[] }], void>()

function listTradesNeedingRvol(): RvolTradeNeed[] {
  return trades
    .filter((t) => t.rvol === null)
    .map(({ id, symbol, date }) => ({ id, symbol, date }))
}

function getCached(symbol: string): RvolCacheRow | null {
  return market.get(symbol) ?? null
}

function setRvol(id: number, value: number | null): void {
  const t = trades.find((x) => x.id === id)
  if (t) t.rvol = value
}

/** Models the real cure: asked again later, the SAME window now covers the
 *  session that had not settled at import time, so the day lands in the map. */
function land(symbol: string): void {
  const pending = wouldLand.get(symbol)
  if (!pending) return
  const row = market.get(symbol)
  if (!row) {
    market.set(symbol, { daily_volumes: { ...pending.days }, avg_volume: pending.avg })
    return
  }
  Object.assign(row.daily_volumes, pending.days)
  row.avg_volume = pending.avg
}

async function refetchSymbols(symbols: string[]): Promise<void> {
  refetchSpy({ force: true, symbols })
  for (const s of symbols) land(s)
}

function deps() {
  return { listTradesNeedingRvol, getCached, refetchSymbols, setRvol }
}

// ── electron-layer mocks, for R2 only ───────────────────────────────────────
vi.mock('../repo', () => ({
  symbolsNeedingRvol: () =>
    [...new Set(trades.filter((t) => t.rvol === null).map((t) => t.symbol))].sort(),
  tradesNeedingRvol: () => listTradesNeedingRvol(),
  getMarketRow: (symbol: string) => {
    const row = market.get(symbol)
    return row
      ? { symbol, daily_volumes: row.daily_volumes, avg_volume: row.avg_volume }
      : null
  },
  setTradeRvol: (id: number, value: number | null) => setRvol(id, value),
}))

vi.mock('../fetch', () => ({
  refreshMarketData: async (opts: { force?: boolean; symbols?: string[] }) => {
    refetchSpy(opts)
    for (const s of opts.symbols ?? []) land(s)
    return {}
  },
}))

// db/database is only reached by the OLD flag gate. Shim it so the settings
// table is EMPTY — the live journal's exact state, where rvol_backfill_pending
// does not exist at all.
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: () => ({ get: () => undefined, run: () => undefined, all: () => [] }),
  }),
}))

beforeEach(() => {
  trades = []
  market.clear()
  wouldLand.clear()
  refetchSpy.mockClear()
})

describe('RVOL deferred repair', () => {
  it('R1 GAP IS HEALED — a trade whose date is missing from the map gets a real rvol', async () => {
    trades = [{ id: 1, symbol: 'GAPX', date: '2026-08-05', rvol: null }]
    // The map stops one trading day short — the measured live shape.
    market.set('GAPX', {
      daily_volumes: { '2026-08-04': 900_000 },
      avg_volume: 1_000_000,
    })
    wouldLand.set('GAPX', { days: { '2026-08-05': 5_000_000 }, avg: 1_000_000 })

    const r = await repairMissingRvol(deps())

    expect(trades[0].rvol).toBeCloseTo(5.0, 6)
    expect(r.filled).toBe(1)
    expect(r.symbolsRefetched).toBe(1)
    expect(refetchSpy).toHaveBeenCalledTimes(1)
  })

  it('R2 NO FLAG REQUIRED — the launch repair runs with the settings key absent', async () => {
    trades = [{ id: 1, symbol: 'GAPX', date: '2026-08-05', rvol: null }]
    market.set('GAPX', {
      daily_volumes: { '2026-08-04': 900_000 },
      avg_volume: 1_000_000,
    })
    wouldLand.set('GAPX', { days: { '2026-08-05': 5_000_000 }, avg: 1_000_000 })

    const { runPendingRvolBackfill } = await import('../rvol-backfill')
    await runPendingRvolBackfill()

    expect(refetchSpy).toHaveBeenCalledTimes(1)
    expect(trades[0].rvol).toBeCloseTo(5.0, 6)
  })

  it('R3 HEALTHY CASE UNTOUCHED — an already-filled trade is neither refetched nor rewritten', async () => {
    trades = [
      { id: 1, symbol: 'HEAL', date: '2026-08-05', rvol: 2.5 },
      { id: 2, symbol: 'GAPX', date: '2026-08-05', rvol: null },
    ]
    market.set('HEAL', { daily_volumes: {}, avg_volume: 1_000_000 })
    market.set('GAPX', {
      daily_volumes: { '2026-08-04': 900_000 },
      avg_volume: 1_000_000,
    })
    wouldLand.set('GAPX', { days: { '2026-08-05': 5_000_000 }, avg: 1_000_000 })

    await repairMissingRvol(deps())

    expect(trades[0].rvol).toBe(2.5) // untouched
    const asked = refetchSpy.mock.calls[0][0].symbols
    expect(asked).toContain('GAPX') // the gap symbol IS fetched...
    expect(asked).not.toContain('HEAL') // ...the healthy one never is
  })

  it('R4 NO-FAKE HOLDS — avg_volume <= 0 stays null even after a refetch', async () => {
    trades = [{ id: 1, symbol: 'ZEROV', date: '2026-08-05', rvol: null }]
    market.set('ZEROV', { daily_volumes: { '2026-08-04': 900_000 }, avg_volume: 0 })
    // The refetch lands the day, but the average is still uncomputable.
    wouldLand.set('ZEROV', { days: { '2026-08-05': 5_000_000 }, avg: 0 })

    const r = await repairMissingRvol(deps())

    expect(trades[0].rvol).toBeNull()
    expect(r.filled).toBe(0)
    expect(r.stillNull).toBe(1)
  })

  it('R5 STAND-DOWN — no NULL rvol anywhere issues ZERO fetches', async () => {
    trades = [
      { id: 1, symbol: 'HEAL', date: '2026-08-05', rvol: 2.5 },
      { id: 2, symbol: 'FINE', date: '2026-08-04', rvol: 7.25 },
    ]
    market.set('HEAL', { daily_volumes: {}, avg_volume: 1_000_000 })

    const r = await repairMissingRvol(deps())

    expect(refetchSpy).not.toHaveBeenCalled()
    expect(r.scanned).toBe(0)
    expect(r.symbolsRefetched).toBe(0)
  })

  it('symbolsMissingTradeDates picks only the symbols the cache cannot answer', () => {
    market.set('COVERED', { daily_volumes: { '2026-08-05': 1 }, avg_volume: 1 })
    market.set('SHORT', { daily_volumes: { '2026-08-04': 1 }, avg_volume: 1 })
    const need: RvolTradeNeed[] = [
      { id: 1, symbol: 'COVERED', date: '2026-08-05' },
      { id: 2, symbol: 'SHORT', date: '2026-08-05' },
      { id: 3, symbol: 'UNCACHED', date: '2026-08-05' },
    ]
    expect(symbolsMissingTradeDates(need, getCached)).toEqual(['SHORT', 'UNCACHED'])
  })
})

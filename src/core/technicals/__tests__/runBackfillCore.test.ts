import { describe, it, expect, vi } from 'vitest'
import { runBackfillCore } from '../runBackfillCore'
import type { BackfillCoreDeps, HydratedTrade } from '../runBackfillCore'
import type { IntradayBar } from '@shared/market-types'

// ── Fixtures ────────────────────────────────────────────────────────────────
// Mirrors computeTradeTechnicals.test.ts's anchored fixture so case (h) can
// produce data_complete: true: 2026-07-15 EDT (09:30 ET = 13:30:00 UTC), warmup
// on the prior trading day (2026-07-14).
const MIN = 60_000
const WARMUP_START = Date.parse('2026-07-14T13:30:00Z')
const ACTIVE_START = Date.parse('2026-07-15T13:30:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

function makeBar(t = 0, c = 100): IntradayBar {
  return { t, o: c, h: c, l: c, c, v: 100 }
}

// Ascending 1-minute bars; o=h=l=c so hlc3 == close. Same shape as the
// computeTradeTechnicals fixture.
function makeBars(
  count: number,
  startT: number,
  stepMs: number,
  basePrice: number,
  priceStep = 0,
): IntradayBar[] {
  return Array.from({ length: count }, (_, i) => {
    const p = basePrice + i * priceStep
    return { t: startT + i * stepMs, o: p, h: p, l: p, c: p, v: 100 }
  })
}

// A hydrated trade with one entry fill at +30m into the active day — the fill
// time that lands inside the data_complete-true bars fixture below.
function mkTrade(id: number, symbol = 'AAA', date = '2026-07-15'): HydratedTrade {
  return {
    id,
    symbol,
    date,
    trade: {
      side: 'long',
      executions: [{ side: 'B', qty: 100, price: 61.5, time: iso(ACTIVE_START + 30 * MIN) }],
    },
  }
}

// data_complete: true fixture (copied from computeTradeTechnicals.test.ts case 1).
const COMPLETE_WARMUP = makeBars(100, WARMUP_START, MIN, 50, 0.05)
const COMPLETE_ACTIVE = makeBars(60, ACTIVE_START, MIN, 60, 0.05)

function makeDeps(overrides: Partial<BackfillCoreDeps> = {}): BackfillCoreDeps {
  return {
    getStaleIds: () => [],
    hydrateTradeChunk: () => [],
    loadBarsForKey: () => null,
    persistTechnicals: () => {},
    ...overrides,
  }
}

describe('runBackfillCore', () => {
  // (a)
  it('returns zero counts when getStaleIds returns empty', async () => {
    const hydrateTradeChunk = vi.fn((): HydratedTrade[] => [])
    const result = await runBackfillCore(
      makeDeps({ getStaleIds: () => [], hydrateTradeChunk }),
    )
    expect(result.computed).toBe(0)
    expect(result.placeholders).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.totalAttempted).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(hydrateTradeChunk).not.toHaveBeenCalled()
  })

  // (b)
  it('splits ids into chunks of the default 50 when chunkSize omitted', async () => {
    const chunkLengths: number[] = []
    const hydrateTradeChunk = vi.fn((ids: readonly number[]): HydratedTrade[] => {
      chunkLengths.push(ids.length)
      return []
    })
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 100 }, (_, i) => i + 1),
        hydrateTradeChunk,
      }),
    )
    expect(hydrateTradeChunk).toHaveBeenCalledTimes(2)
    expect(chunkLengths).toEqual([50, 50])
  })

  // (c)
  it('splits ids into chunks of the provided chunkSize', async () => {
    const chunkLengths: number[] = []
    const hydrateTradeChunk = vi.fn((ids: readonly number[]): HydratedTrade[] => {
      chunkLengths.push(ids.length)
      return []
    })
    await runBackfillCore(
      makeDeps({ getStaleIds: () => [1, 2, 3, 4, 5, 6, 7], hydrateTradeChunk }),
      { chunkSize: 3 },
    )
    expect(chunkLengths).toEqual([3, 3, 1])
  })

  // (d) — invalid chunkSize falls back to default 50 (100 ids → 2 chunks).
  it('falls back to default chunkSize 50 for chunkSize 0', async () => {
    const hydrateTradeChunk = vi.fn((): HydratedTrade[] => [])
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 100 }, (_, i) => i + 1),
        hydrateTradeChunk,
      }),
      { chunkSize: 0 },
    )
    expect(hydrateTradeChunk).toHaveBeenCalledTimes(2)
  })

  it('falls back to default chunkSize 50 for chunkSize -1', async () => {
    const hydrateTradeChunk = vi.fn((): HydratedTrade[] => [])
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 100 }, (_, i) => i + 1),
        hydrateTradeChunk,
      }),
      { chunkSize: -1 },
    )
    expect(hydrateTradeChunk).toHaveBeenCalledTimes(2)
  })

  it('falls back to default chunkSize 50 for chunkSize 1.5', async () => {
    const hydrateTradeChunk = vi.fn((): HydratedTrade[] => [])
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 100 }, (_, i) => i + 1),
        hydrateTradeChunk,
      }),
      { chunkSize: 1.5 },
    )
    expect(hydrateTradeChunk).toHaveBeenCalledTimes(2)
  })

  // (e)
  it('persists makeIncompleteTechnicals when loadBarsForKey returns null', async () => {
    const persistTechnicals = vi.fn()
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [42],
        hydrateTradeChunk: (): HydratedTrade[] => [mkTrade(42)],
        loadBarsForKey: () => null,
        persistTechnicals,
      }),
    )
    expect(persistTechnicals).toHaveBeenCalledTimes(1)
    const [id, technicals] = persistTechnicals.mock.calls[0]
    expect(id).toBe(42)
    expect(technicals.data_complete).toBe(false)
    expect(technicals.tf_1m.macd_line).toBeNull()
    expect(result.placeholders).toBe(1)
    expect(result.computed).toBe(0)
  })

  // (f)
  it('persists makeIncompleteTechnicals when bars.length is 0', async () => {
    const persistTechnicals = vi.fn()
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [42],
        hydrateTradeChunk: (): HydratedTrade[] => [mkTrade(42)],
        loadBarsForKey: () => ({ bars: [], warmupBars: [makeBar(WARMUP_START, 100)] }),
        persistTechnicals,
      }),
    )
    expect(result.placeholders).toBe(1)
    expect(result.computed).toBe(0)
  })

  // (g)
  it('persists makeIncompleteTechnicals when warmupBars.length is 0', async () => {
    const persistTechnicals = vi.fn()
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [42],
        hydrateTradeChunk: (): HydratedTrade[] => [mkTrade(42)],
        loadBarsForKey: () => ({ bars: [makeBar(ACTIVE_START, 100)], warmupBars: [] }),
        persistTechnicals,
      }),
    )
    expect(result.placeholders).toBe(1)
    expect(result.computed).toBe(0)
  })

  // (h)
  it('computes and persists real technicals when bars+warmupBars both present', async () => {
    const persistTechnicals = vi.fn()
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [7],
        hydrateTradeChunk: (): HydratedTrade[] => [mkTrade(7)],
        loadBarsForKey: () => ({ bars: COMPLETE_ACTIVE, warmupBars: COMPLETE_WARMUP }),
        persistTechnicals,
      }),
    )
    expect(persistTechnicals).toHaveBeenCalledTimes(1)
    const [id, technicals] = persistTechnicals.mock.calls[0]
    expect(id).toBe(7)
    expect(technicals.data_complete).toBe(true)
    expect(result.computed).toBe(1)
    expect(result.placeholders).toBe(0)
  })

  // (i)
  it('caches bars per (symbol, date) — second trade on same key does not re-fetch', async () => {
    const loadBarsForKey = vi.fn(() => ({
      bars: COMPLETE_ACTIVE,
      warmupBars: COMPLETE_WARMUP,
    }))
    const persistTechnicals = vi.fn()
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => [1, 2],
        hydrateTradeChunk: (): HydratedTrade[] => [
          mkTrade(1, 'AAA', '2026-07-15'),
          mkTrade(2, 'AAA', '2026-07-15'),
        ],
        loadBarsForKey,
        persistTechnicals,
      }),
    )
    expect(loadBarsForKey).toHaveBeenCalledTimes(1)
    expect(persistTechnicals).toHaveBeenCalledTimes(2)
  })

  // (j)
  it('counts computed, placeholders, and errors separately', async () => {
    const persistTechnicals = vi.fn((id: number) => {
      if (id === 3) throw new Error('persist boom')
    })
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [1, 2, 3, 4],
        hydrateTradeChunk: (): HydratedTrade[] => [
          mkTrade(1, 'S1'),
          mkTrade(2, 'S2'),
          mkTrade(3, 'S3'),
          mkTrade(4, 'S4'),
        ],
        // null for S1 & S2 (placeholder); valid bundle for S3 & S4 (compute).
        loadBarsForKey: (symbol) =>
          symbol === 'S1' || symbol === 'S2'
            ? null
            : { bars: COMPLETE_ACTIVE, warmupBars: COMPLETE_WARMUP },
        persistTechnicals,
      }),
    )
    expect(result.placeholders).toBe(2) // S1, S2
    expect(result.computed).toBe(1) // S4 (S3 threw during persist)
    expect(result.errors).toBe(1) // S3
    expect(result.totalAttempted).toBe(4)
  })

  // (k)
  it('yieldBetweenChunks is awaited between chunks (default chunkSize)', async () => {
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 100 }, (_, i) => i + 1),
        hydrateTradeChunk: (): HydratedTrade[] => [],
        yieldBetweenChunks,
      }),
    )
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  // (l)
  it('onChunkComplete fires once per chunk with 1-indexed (chunkNumber, totalChunks)', async () => {
    const calls: Array<[number, number]> = []
    await runBackfillCore(
      makeDeps({
        getStaleIds: () => Array.from({ length: 7 }, (_, i) => i + 1),
        hydrateTradeChunk: (): HydratedTrade[] => [],
        onChunkComplete: (chunkNumber, totalChunks) => calls.push([chunkNumber, totalChunks]),
      }),
      { chunkSize: 3 },
    )
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  // (m)
  it('continues past a trade whose persist throws', async () => {
    const persistTechnicals = vi.fn((id: number) => {
      if (id === 2) throw new Error('persist boom')
    })
    const result = await runBackfillCore(
      makeDeps({
        getStaleIds: () => [1, 2, 3],
        hydrateTradeChunk: (): HydratedTrade[] => [
          mkTrade(1, 'S1'),
          mkTrade(2, 'S2'),
          mkTrade(3, 'S3'),
        ],
        loadBarsForKey: () => ({ bars: COMPLETE_ACTIVE, warmupBars: COMPLETE_WARMUP }),
        persistTechnicals,
      }),
    )
    expect(persistTechnicals).toHaveBeenCalledTimes(3)
    expect(result.errors).toBe(1)
  })

  // (n)
  it('durationMs is finite and non-negative', async () => {
    const result = await runBackfillCore(makeDeps({ getStaleIds: () => [] }))
    expect(Number.isFinite(result.durationMs)).toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})

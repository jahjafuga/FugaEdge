import { describe, it, expect, vi, beforeEach } from 'vitest'

// Beat 2.2b — runWarmupBackfill orchestrator. TDD.
//
// The §K bulk warmup pass: enumerate (symbol, date) keys with active bars but
// empty warmup (warmupKeysNeedingFetch), fetch warmup per key, and upsert it
// back with the warmup_attempted_at marker — preserving the cached active bars
// + fetched_at. Wraps the generic runChunkedBackfill primitive (used REAL here;
// it's pure, no DB), mirroring runTradeTechnicalsBackfill's thin-wrapper shape.
//
// Mocks the three side-effecting modules (same pattern as bars-get-warmup.test.ts):
//   ../repo            — warmupKeysNeedingFetch / getIntradayRow / upsertIntradayRow
//   ../bars-get        — fetchWarmupBars
//   ../../settings/repo — getSettings (NOTE: real shape is { values: {...} })
// runChunkedBackfill (@/lib/chunkedBackfill) is intentionally NOT mocked so the
// real chunk/yield/progress mechanic drives R9's multi-chunk progression.
//
// Namespace import so a missing runWarmupBackfill RED-fails per-test as
// "is not a function" rather than crashing collection.

const mocks = vi.hoisted(() => ({
  warmupKeysNeedingFetch: vi.fn(),
  getIntradayRow: vi.fn(),
  upsertIntradayRow: vi.fn(),
  fetchWarmupBars: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../repo', () => ({
  warmupKeysNeedingFetch: mocks.warmupKeysNeedingFetch,
  getIntradayRow: mocks.getIntradayRow,
  upsertIntradayRow: mocks.upsertIntradayRow,
}))

vi.mock('../bars-get', () => ({
  fetchWarmupBars: mocks.fetchWarmupBars,
}))

vi.mock('../../settings/repo', () => ({
  getSettings: mocks.getSettings,
}))

import * as warmupBackfill from '../warmup-backfill'

const bar = (t: number) => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 })

// An intraday row as getIntradayRow returns it: active bars present, warmup
// empty (the eligible state). Per-test overrides via `over`.
const cachedRow = (over: Record<string, unknown> = {}) => ({
  symbol: 'AAPL',
  date: '2026-06-09',
  bars: [bar(1)],
  warmup_bars: [],
  fetched_at: 'T0',
  error: null,
  ...over,
})

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockReturnValue({ values: { polygon_api_key: 'TEST_KEY' } })
  mocks.warmupKeysNeedingFetch.mockReturnValue([])
  mocks.getIntradayRow.mockImplementation((symbol: string, date: string) =>
    cachedRow({ symbol, date }),
  )
  mocks.fetchWarmupBars.mockResolvedValue([bar(0)])
})

describe('runWarmupBackfill', () => {
  it('(R1) empty worklist → zero counts, no fetch, no upsert', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([])
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toEqual({
      fetched: 0,
      empty: 0,
      errors: 0,
      totalAttempted: 0,
      durationMs: expect.any(Number),
    })
    expect(mocks.fetchWarmupBars).not.toHaveBeenCalled()
    expect(mocks.upsertIntradayRow).not.toHaveBeenCalled()
  })

  it('(R2) single key → fetchWarmupBars called once with (apiKey, symbol, date)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    await warmupBackfill.runWarmupBackfill()
    expect(mocks.fetchWarmupBars).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWarmupBars).toHaveBeenCalledWith('TEST_KEY', 'AAPL', '2026-06-09')
  })

  it('(R3) success → upsert preserves bars + fetched_at, writes warmup_bars + ISO marker', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.getIntradayRow.mockReturnValue(
      cachedRow({ bars: [bar(1), bar(2)], fetched_at: 'FETCHED_T0' }),
    )
    mocks.fetchWarmupBars.mockResolvedValue([bar(0)])
    await warmupBackfill.runWarmupBackfill()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow).toHaveBeenCalledWith({
      symbol: 'AAPL',
      date: '2026-06-09',
      bars: [bar(1), bar(2)], // preserved
      warmup_bars: [bar(0)], // freshly fetched
      warmup_attempted_at: ISO,
      fetched_at: 'FETCHED_T0', // preserved
      error: null, // preserved (cached.error)
    })
  })

  it('(R4) empty fetch result → upsert still stamps the marker (empty is legit)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.fetchWarmupBars.mockResolvedValue([])
    const result = await warmupBackfill.runWarmupBackfill()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow.mock.calls[0][0]).toMatchObject({
      warmup_bars: [],
      warmup_attempted_at: ISO,
    })
    expect(result).toMatchObject({ fetched: 0, empty: 1, errors: 0, totalAttempted: 1 })
  })

  it('(R5) fetch throws → upsert still stamps the marker (not re-tried), counted as error', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.fetchWarmupBars.mockRejectedValue(new Error('401 Unauthorized'))
    const result = await warmupBackfill.runWarmupBackfill()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow.mock.calls[0][0]).toMatchObject({
      warmup_bars: [],
      warmup_attempted_at: ISO,
    })
    expect(result).toMatchObject({ fetched: 0, empty: 0, errors: 1, totalAttempted: 1 })
  })

  it('(R6) three keys all succeed → fetched 3', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-03' },
      { symbol: 'BBB', date: '2026-06-02' },
      { symbol: 'CCC', date: '2026-06-01' },
    ])
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toMatchObject({ fetched: 3, empty: 0, errors: 0, totalAttempted: 3 })
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(3)
  })

  it('(R7) three keys, one throws → fetched 2, errors 1, others still processed', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-03' },
      { symbol: 'BBB', date: '2026-06-02' },
      { symbol: 'CCC', date: '2026-06-01' },
    ])
    mocks.fetchWarmupBars.mockImplementation(async (_key: string, symbol: string) => {
      if (symbol === 'BBB') throw new Error('boom')
      return [bar(0)]
    })
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toMatchObject({ fetched: 2, empty: 0, errors: 1, totalAttempted: 3 })
    // all three upserted — the thrown key still gets its marker stamped
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(3)
  })

  it('(R8) mixed success / empty / throw → fetched 1, empty 1, errors 1', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-03' },
      { symbol: 'BBB', date: '2026-06-02' },
      { symbol: 'CCC', date: '2026-06-01' },
    ])
    mocks.fetchWarmupBars.mockImplementation(async (_key: string, symbol: string) => {
      if (symbol === 'AAA') return [bar(0)] // success
      if (symbol === 'BBB') return [] // empty
      throw new Error('boom') // CCC throws
    })
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toMatchObject({ fetched: 1, empty: 1, errors: 1, totalAttempted: 3 })
  })

  it('(R9) onProgress fires per chunk; 120 keys → 3 chunks, progression 1→2→3', async () => {
    const keys = Array.from({ length: 120 }, (_, i) => ({ symbol: `S${i}`, date: '2026-06-01' }))
    mocks.warmupKeysNeedingFetch.mockReturnValue(keys)
    const onProgress = vi.fn()
    const result = await warmupBackfill.runWarmupBackfill({ onProgress })
    expect(result.totalAttempted).toBe(120)
    expect(onProgress).toHaveBeenCalledTimes(3) // 50 + 50 + 20
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      { chunkNumber: 1, totalChunks: 3 },
      { chunkNumber: 2, totalChunks: 3 },
      { chunkNumber: 3, totalChunks: 3 },
    ])
  })

  it('(R10) getIntradayRow null → key skipped (no upsert), counted as error; others proceed', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-02' },
      { symbol: 'GONE', date: '2026-06-01' },
    ])
    mocks.getIntradayRow.mockImplementation((symbol: string, date: string) =>
      symbol === 'GONE' ? null : cachedRow({ symbol, date }),
    )
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toMatchObject({ fetched: 1, empty: 0, errors: 1, totalAttempted: 2 })
    // GONE: no fetch, no upsert. AAA: fetched + upserted.
    expect(mocks.fetchWarmupBars).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWarmupBars).toHaveBeenCalledWith('TEST_KEY', 'AAA', '2026-06-02')
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
  })

  it('(R11) result includes durationMs >= 0', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAA', date: '2026-06-01' }])
    const result = await warmupBackfill.runWarmupBackfill()
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('(R12) no API key → zero counts; no fetch, no upsert (defer until configured)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAA', date: '2026-06-01' }])
    mocks.getSettings.mockReturnValue({ values: { polygon_api_key: null } })
    const result = await warmupBackfill.runWarmupBackfill()
    expect(result).toEqual({
      fetched: 0,
      empty: 0,
      errors: 0,
      totalAttempted: 0,
      durationMs: expect.any(Number),
    })
    expect(mocks.fetchWarmupBars).not.toHaveBeenCalled()
    expect(mocks.upsertIntradayRow).not.toHaveBeenCalled()
  })
})

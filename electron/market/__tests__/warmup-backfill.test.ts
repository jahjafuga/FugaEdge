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
  tradeCountsByKey: vi.fn(),
  fetchWarmupBars: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../repo', () => ({
  warmupKeysNeedingFetch: mocks.warmupKeysNeedingFetch,
  getIntradayRow: mocks.getIntradayRow,
  upsertIntradayRow: mocks.upsertIntradayRow,
  tradeCountsByKey: mocks.tradeCountsByKey,
}))

vi.mock('../bars-get', () => ({
  fetchWarmupBars: mocks.fetchWarmupBars,
}))

vi.mock('../../settings/repo', () => ({
  getSettings: mocks.getSettings,
}))

import * as warmupBackfill from '../warmup-backfill'
import { MassiveError } from '../massive'
import { WARMUP_SPACING_MS } from '../rate-limit'

// Inject an instant sleep so the 12s WARMUP_SPACING_MS floor (and any 429 backoff)
// doesn't make these deterministic tests wait in real time. The spacing math is
// proven in rate-limit.test.ts; here we just keep the clock fast. R15 overrides
// with its own spy to assert the spacing IS applied.
const noopSleep = () => Promise.resolve()
const run = (opts: Record<string, unknown> = {}) =>
  warmupBackfill.runWarmupBackfill({ sleep: noopSleep, ...opts })

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
  // Default: one trade per worklist key, so tradesTotal === keys.length. Tests
  // that assert exact trade progress (R9, R13) set their own counts.
  mocks.tradeCountsByKey.mockImplementation((keys: { symbol: string; date: string }[]) =>
    Object.fromEntries(keys.map((k) => [`${k.symbol}|${k.date}`, 1])),
  )
  mocks.fetchWarmupBars.mockResolvedValue([bar(0)])
})

describe('runWarmupBackfill', () => {
  it('(R1) empty worklist → zero counts, no fetch, no upsert', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([])
    const result = await run()
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
    await run()
    expect(mocks.fetchWarmupBars).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWarmupBars).toHaveBeenCalledWith('TEST_KEY', 'AAPL', '2026-06-09')
  })

  it('(R3) success → upsert preserves bars + fetched_at, writes warmup_bars + ISO marker', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.getIntradayRow.mockReturnValue(
      cachedRow({ bars: [bar(1), bar(2)], fetched_at: 'FETCHED_T0' }),
    )
    mocks.fetchWarmupBars.mockResolvedValue([bar(0)])
    await run()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow).toHaveBeenCalledWith({
      symbol: 'AAPL',
      date: '2026-06-09',
      bars: [bar(1), bar(2)], // preserved
      warmup_bars: [bar(0)], // freshly fetched
      warmup_attempted_at: ISO,
      warmup_error: null, // §K.1.2 — null on success (fetch did not throw)
      fetched_at: 'FETCHED_T0', // preserved
      error: null, // preserved (cached.error)
    })
  })

  it('(R4) empty fetch result → upsert still stamps the marker (empty is legit)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.fetchWarmupBars.mockResolvedValue([])
    const result = await run()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow.mock.calls[0][0]).toMatchObject({
      warmup_bars: [],
      warmup_attempted_at: ISO,
      warmup_error: null, // §K.1.2 — empty is legit, not an error (stays locked)
    })
    expect(result).toMatchObject({ fetched: 0, empty: 1, errors: 0, totalAttempted: 1 })
  })

  it('(R5) fetch throws → upsert still stamps the marker (not re-tried), counted as error', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAPL', date: '2026-06-09' }])
    mocks.fetchWarmupBars.mockRejectedValue(new Error('401 Unauthorized'))
    const result = await run()
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
    expect(mocks.upsertIntradayRow.mock.calls[0][0]).toMatchObject({
      warmup_bars: [],
      warmup_attempted_at: ISO,
      warmup_error: '401 Unauthorized', // §K.1.2 — the thrown message is stamped
    })
    expect(result).toMatchObject({ fetched: 0, empty: 0, errors: 1, totalAttempted: 1 })
  })

  it('(R6) three keys all succeed → fetched 3', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-03' },
      { symbol: 'BBB', date: '2026-06-02' },
      { symbol: 'CCC', date: '2026-06-01' },
    ])
    const result = await run()
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
    const result = await run()
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
    const result = await run()
    expect(result).toMatchObject({ fetched: 1, empty: 1, errors: 1, totalAttempted: 3 })
  })

  it('(R9) onProgress emits PER KEY (not per 50-chunk); 120 keys (1 trade each) → 120 ticks', async () => {
    const keys = Array.from({ length: 120 }, (_, i) => ({ symbol: `S${i}`, date: '2026-06-01' }))
    mocks.warmupKeysNeedingFetch.mockReturnValue(keys)
    // default tradeCountsByKey → 1 trade per key, so tradesTotal = 120
    const onProgress = vi.fn()
    const result = await run({ onProgress })
    expect(result.totalAttempted).toBe(120)
    // Per-key (was per-50-chunk) so a paced multi-minute run shows steady movement.
    expect(onProgress).toHaveBeenCalledTimes(120)
    expect(onProgress.mock.calls[0][0]).toEqual({ tradesDone: 1, tradesTotal: 120 })
    expect(onProgress.mock.calls[119][0]).toEqual({ tradesDone: 120, tradesTotal: 120 })
  })

  it('(R13) tradesTotal sums per-key trade counts; final tradesDone === tradesTotal', async () => {
    const keys = [
      { symbol: 'AAA', date: '2026-06-03' },
      { symbol: 'BBB', date: '2026-06-02' },
      { symbol: 'CCC', date: '2026-06-01' },
    ]
    mocks.warmupKeysNeedingFetch.mockReturnValue(keys)
    mocks.tradeCountsByKey.mockReturnValue({
      'AAA|2026-06-03': 4,
      'BBB|2026-06-02': 1,
      'CCC|2026-06-01': 2,
    })
    const onProgress = vi.fn()
    await run({ onProgress })
    // per-key cumulative ticks in key order: 4, +1, +2 = 7 total
    expect(mocks.tradeCountsByKey).toHaveBeenCalledWith(keys)
    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      { tradesDone: 4, tradesTotal: 7 },
      { tradesDone: 5, tradesTotal: 7 },
      { tradesDone: 7, tradesTotal: 7 },
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
    const result = await run()
    expect(result).toMatchObject({ fetched: 1, empty: 0, errors: 1, totalAttempted: 2 })
    // GONE: no fetch, no upsert. AAA: fetched + upserted.
    expect(mocks.fetchWarmupBars).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWarmupBars).toHaveBeenCalledWith('TEST_KEY', 'AAA', '2026-06-02')
    expect(mocks.upsertIntradayRow).toHaveBeenCalledTimes(1)
  })

  it('(R11) result includes durationMs >= 0', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAA', date: '2026-06-01' }])
    const result = await run()
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('(R12) no API key → zero counts; no fetch, no upsert (defer until configured)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAA', date: '2026-06-01' }])
    mocks.getSettings.mockReturnValue({ values: { polygon_api_key: null } })
    const result = await run()
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

  it('(R14) a 429 is RETRIED via withRateLimitRetry (not thrown/stranded)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([{ symbol: 'AAA', date: '2026-06-01' }])
    let calls = 0
    mocks.fetchWarmupBars.mockImplementation(async () => {
      calls += 1
      if (calls === 1) throw new MassiveError('429 Too Many Requests', 429, '/path', null)
      return [bar(0)]
    })
    const result = await run() // noopSleep absorbs the backoff wait
    expect(calls).toBe(2) // retried once, then succeeded — NOT stranded
    expect(result).toMatchObject({ fetched: 1, empty: 0, errors: 0, totalAttempted: 1 })
    // a retried success is a clean success — no warmup_error stamped
    expect(mocks.upsertIntradayRow.mock.calls[0][0]).toMatchObject({
      warmup_bars: [bar(0)],
      warmup_error: null,
    })
  })

  it('(R15) paces successive fetches via WARMUP_SPACING_MS (the free-tier-derived floor)', async () => {
    mocks.warmupKeysNeedingFetch.mockReturnValue([
      { symbol: 'AAA', date: '2026-06-02' },
      { symbol: 'BBB', date: '2026-06-01' },
    ])
    const sleepSpy = vi.fn().mockResolvedValue(undefined)
    await warmupBackfill.runWarmupBackfill({ sleep: sleepSpy })
    // A spacing wait is imposed between the two fetches (first key doesn't wait —
    // lastRequestAt 0), and no wait exceeds the derived constant.
    expect(sleepSpy).toHaveBeenCalled()
    for (const c of sleepSpy.mock.calls) {
      expect(c[0]).toBeGreaterThan(0)
      expect(c[0]).toBeLessThanOrEqual(WARMUP_SPACING_MS)
    }
  })
})

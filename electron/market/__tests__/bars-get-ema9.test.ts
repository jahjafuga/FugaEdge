import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chart-open EMA9 sibling: after getIntradayBars resolves a payload with active
// bars, it should fire backfillAllEma9Distances (fire-and-forget setImmediate),
// so Entry-vs-9EMA populates WITHOUT a manual refresh. Mirrors the mock shape of
// bars-get-warmup.test.ts; the technicals lazy-guard + intraday are mocked so no
// real DB / technicals layer loads.
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
type Row = { symbol: string; date: string; bars: Bar[]; warmup_bars: Bar[]; fetched_at: string; error: string | null }
const bar = (t: number): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 })

const { state, backfillSpy } = vi.hoisted(() => ({
  state: { cachedRow: null as Row | null, apiKey: 'test-key' as string | null },
  backfillSpy: vi.fn(),
}))

vi.mock('../repo', () => ({
  getIntradayRow: () => state.cachedRow,
  upsertIntradayRow: vi.fn(),
}))
vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: state.apiKey } }),
}))
vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return { ...actual, fetchIntradayMinutes: vi.fn(async () => [bar(1)]) }
})
// Keep the existing lazy-guard hook a no-op so it doesn't pull the technicals
// layer (better-sqlite3) when the positive payload also satisfies its guard.
vi.mock('../../technicals/lazy-guard', () => ({ runLazyGuardForPayload: vi.fn() }))
vi.mock('../intraday', () => ({ backfillAllEma9Distances: backfillSpy }))

import { getIntradayBars } from '../bars-get'

const SYM = 'AAA'
const DATE = '2026-06-09'

beforeEach(() => {
  state.cachedRow = null
  state.apiKey = 'test-key'
  backfillSpy.mockClear()
})

describe('getIntradayBars — EMA9 distance auto-backfill sibling', () => {
  it('fires backfillAllEma9Distances after a fetch with active bars present', async () => {
    state.cachedRow = { symbol: SYM, date: DATE, bars: [bar(1)], warmup_bars: [bar(0)], fetched_at: 'T0', error: null }
    const p = await getIntradayBars(SYM, DATE)
    expect(p.bars.length).toBeGreaterThan(0)
    await vi.waitFor(() => expect(backfillSpy).toHaveBeenCalledTimes(1))
  })

  it('does NOT fire when there are no active bars (apiKey missing, empty cache)', async () => {
    state.apiKey = null
    state.cachedRow = { symbol: SYM, date: DATE, bars: [], warmup_bars: [], fetched_at: 'T0', error: null }
    const p = await getIntradayBars(SYM, DATE)
    expect(p.bars.length).toBe(0)
    await new Promise((r) => setImmediate(r)) // let any erroneous setImmediate run
    expect(backfillSpy).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 5c incremental default: with Force re-fetch OFF, a refresh fetches only the
// (symbol, date) pairs that are MISSING or previously ERRORED and SKIPS pairs
// already cleanly cached; with Force ON it re-downloads everything. This drives
// the REAL refreshIntraday + intradayPairsNeedingFetch selection in-memory
// (only db/settings/network mocked) and observes which pairs the worker pool
// actually asks to fetch.

const PAIRS = [
  { symbol: 'CLEAN', date: '2026-05-01' },
  { symbol: 'MISSING', date: '2026-05-01' },
  { symbol: 'ERRORED', date: '2026-05-01' },
]
// intraday_bars cache: CLEAN fetched cleanly (error null), ERRORED previously
// failed (error set), MISSING absent entirely.
const CACHED = [
  { symbol: 'CLEAN', date: '2026-05-01', error: null },
  { symbol: 'ERRORED', date: '2026-05-01', error: 'network: prior failure' },
]

// In-memory better-sqlite3 stand-in — answers exactly the queries the real repo
// + backfills run, branching on SQL text. No real DB, no Electron app.
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return PAIRS // tradeSymbolDatePairs
        if (sql.includes('FROM intraday_bars')) return CACHED // intradayPairsNeedingFetch
        return [] // backfill trade scans → 0 rows, so backfills are no-ops
      },
      get: () => undefined,
      run: () => ({ changes: 0 }),
    }),
  }),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

// Capture which pairs the worker pool actually requests. Every requested pair
// "succeeds" so the test observes WHICH pairs are fetched, not network health.
const requested: string[] = []
vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual,
    fetchIntradayMinutes: vi.fn(async (_key: string, symbol: string, date: string) => {
      requested.push(`${symbol}|${date}`)
      return [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]
    }),
  }
})

import { refreshIntraday } from '../intraday'

describe('refreshIntraday incremental selection (Force re-fetch off vs on)', () => {
  beforeEach(() => {
    requested.length = 0
  })

  it('force=false fetches MISSING + ERRORED and SKIPS the cleanly-cached pair', async () => {
    const result = await refreshIntraday({ force: false })

    expect([...requested].sort()).toEqual(['ERRORED|2026-05-01', 'MISSING|2026-05-01'])
    expect(requested).not.toContain('CLEAN|2026-05-01')
    expect(result.attempted).toBe(2) // selection is force-driven, not just the fetch
  })

  it('force=true fetches ALL pairs (full re-download)', async () => {
    const result = await refreshIntraday({ force: true })

    expect([...requested].sort()).toEqual([
      'CLEAN|2026-05-01',
      'ERRORED|2026-05-01',
      'MISSING|2026-05-01',
    ])
    expect(result.attempted).toBe(3)
  })
})

import { describe, expect, it, vi } from 'vitest'

// Batch-level proof for the 5c timeout fix: when ONE (symbol, date) pair fails
// with the timeout MassiveError, the real refreshIntraday worker pool still
// drains — the overall promise RESOLVES (no hang), the stalled pair is counted
// failed, and the other pairs still succeed. The DB/settings layers are mocked
// so this runs in-memory (no sqlite file, no Electron app); the worker loop in
// intraday.ts is the real code under test.

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

// Backfills call openDatabase().prepare(...).all() — a no-trade fake DB makes
// them iterate zero rows and return 0, without a real connection.
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => {} }),
  }),
}))

vi.mock('../repo', () => ({
  intradayPairsNeedingFetch: () => ({
    pairs: [
      { symbol: 'AAA', date: '2026-05-01' },
      { symbol: 'STALL', date: '2026-05-01' },
      { symbol: 'BBB', date: '2026-05-01' },
    ],
    cooldownSkipped: 0,
  }),
  upsertIntradayRow: vi.fn(),
  getIntradayRow: () => null,
  setTradeEma9Distance: vi.fn(),
  setTradeMaeMfe: vi.fn(),
}))

// Keep the real MassiveError class (rate-limit.ts + intraday.ts both rely on
// `instanceof MassiveError`); only stub the network call. 'STALL' rejects the
// way a timed-out request now does: a non-429 MassiveError.
vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual,
    fetchIntradayMinutes: vi.fn(async (_key: string, symbol: string) => {
      if (symbol === 'STALL') {
        throw new actual.MassiveError('Request timed out after 15000ms', 0, '/v2/aggs/STALL')
      }
      return [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]
    }),
  }
})

import { refreshIntraday } from '../intraday'

describe('refreshIntraday batch — a stalled pair never hangs the pool', () => {
  it('resolves, counts the stalled pair as failed, and the other pairs still succeed', async () => {
    // If the pool failed to drain (the original bug), this await would never
    // return and the test would time out.
    const result = await refreshIntraday({ force: true })

    expect(result.attempted).toBe(3)
    expect(result.fetched).toBe(2) // AAA + BBB
    expect(result.failed).toBe(1) // STALL
    expect(result.errors.map((e) => e.symbol)).toEqual(['STALL'])
  })
})

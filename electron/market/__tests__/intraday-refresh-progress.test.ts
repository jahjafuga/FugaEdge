import { describe, expect, it, vi } from 'vitest'

// Commit P (5c progress): refreshIntraday must report live progress as each
// pair completes, so the renderer can show a loading bar instead of a dead
// greyed-out button. Drives the real worker pool in-memory (db/settings/network
// mocked) and asserts emitProgress fires per pair with a rising current and the
// correct total.

const PAIRS = [
  { symbol: 'AAA', date: '2026-05-01' },
  { symbol: 'BBB', date: '2026-05-01' },
  { symbol: 'CCC', date: '2026-05-01' },
]

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return PAIRS // tradeSymbolDatePairs
        if (sql.includes('FROM intraday_bars')) return [] // nothing cached → all fetched
        return [] // backfill trade scans → no-op
      },
      get: () => undefined,
      run: () => ({ changes: 0 }),
    }),
  }),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual,
    fetchIntradayMinutes: vi.fn(async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]),
  }
})

import { refreshIntraday } from '../intraday'

describe('refreshIntraday progress emission', () => {
  it('calls emitProgress once per pair with a rising current and the correct total', async () => {
    const events: { current: number; total: number; symbol: string }[] = []

    await refreshIntraday({ force: true, emitProgress: (p) => events.push(p) })

    expect(events).toHaveLength(3)
    expect(events.map((e) => e.current)).toEqual([1, 2, 3]) // monotonic, one per completed pair
    expect(events.every((e) => e.total === 3)).toBe(true)
    expect(events.map((e) => e.symbol).sort()).toEqual(['AAA', 'BBB', 'CCC'])
  })
})

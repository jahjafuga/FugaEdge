import { describe, expect, it, vi } from 'vitest'

// Commit C (coarse cancel): a cancel must STOP starting new pairs while the
// refresh promise still RESOLVES cleanly with cancelled:true (so the airtight
// settle chain from P/P.5 — main finally → store finally → spinner clears — is
// preserved). Already-fetched pairs stay saved (cancel = stop, not rollback).

const PAIRS = [
  { symbol: 'A', date: '2026-05-01' },
  { symbol: 'B', date: '2026-05-01' },
  { symbol: 'C', date: '2026-05-01' },
  { symbol: 'D', date: '2026-05-01' },
  { symbol: 'E', date: '2026-05-01' },
]

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return PAIRS
        if (sql.includes('FROM intraday_bars')) return []
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

// Hold every fetch until the test releases — gives us a deterministic moment
// to fire cancel while pairs are in-flight.
const requested: string[] = []
let release!: () => void
let hold = new Promise<void>((res) => { release = res })

vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual,
    fetchIntradayMinutes: vi.fn(async (_k: string, sym: string) => {
      requested.push(sym)
      await hold
      return [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]
    }),
  }
})

import { refreshIntraday, cancelIntradayRefresh } from '../intraday'

describe('refreshIntraday cancel — coarse, preserves the settle chain', () => {
  it('resolves with cancelled=true and stops starting new pairs after cancel', async () => {
    // Reset hold for this test.
    hold = new Promise<void>((res) => { release = res })
    requested.length = 0

    const runPromise = refreshIntraday({ force: true })

    // Let the workers reach the awaited fetchIntradayMinutes (still held).
    await new Promise((r) => setTimeout(r, 50))

    cancelIntradayRefresh()

    // Release the in-flight fetches — workers complete those, then check the
    // flag at the top of the loop and exit without starting new pairs.
    release()

    const result = await runPromise

    // Load-bearing settle: the promise resolves cleanly with cancelled.
    expect(result.cancelled).toBe(true)
    expect(result.attempted).toBe(5)
    // Stopped early — fewer fetched than attempted; no failures.
    expect(result.fetched).toBeGreaterThanOrEqual(1)
    expect(result.fetched).toBeLessThan(5)
    expect(result.failed).toBe(0)
    expect(result.errors).toEqual([])
  })
})

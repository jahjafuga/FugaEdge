import { describe, expect, it, vi } from 'vitest'

// Integration over the REAL intradayPairsNeedingFetch JS filter + the real
// shouldRetryErrored predicate; only the DB read is mocked (canned rows). The
// SQL itself is trivial (a SELECT); the selection logic is what we assert.

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const ago = (ms: number) => new Date(now - ms).toISOString()
const D = '2026-05-01'
const GATED = '403: 403 Forbidden — {"status":"NOT_AUTHORIZED"}'

const PAIRS = [
  { symbol: 'NEW', date: D },
  { symbol: 'CLEAN', date: D },
  { symbol: 'GATED_RECENT', date: D },
  { symbol: 'GATED_OLD', date: D },
  { symbol: 'TRANSIENT', date: D },
]
const BARS = [
  { symbol: 'CLEAN', date: D, error: null, fetched_at: ago(1 * DAY) },
  { symbol: 'GATED_RECENT', date: D, error: GATED, fetched_at: ago(10 * DAY) }, // within cooldown
  { symbol: 'GATED_OLD', date: D, error: GATED, fetched_at: ago(50 * DAY) }, // aged past cooldown
  { symbol: 'TRANSIENT', date: D, error: '429: 429 Too Many Requests', fetched_at: ago(1 * DAY) },
]

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return PAIRS // tradeSymbolDatePairs
        if (sql.includes('FROM intraday_bars')) return BARS
        return []
      },
    }),
  }),
}))

import { intradayPairsNeedingFetch } from '../repo'

describe('intradayPairsNeedingFetch — plan-gate cooldown', () => {
  it('force=false: skips clean + plan-gated-within-cooldown; keeps new, aged-gated, transient', () => {
    const got = intradayPairsNeedingFetch(false).map((p) => p.symbol).sort()
    expect(got).toEqual(['GATED_OLD', 'NEW', 'TRANSIENT'])
  })

  it('force=true: returns ALL pairs (upgrade path — no filtering)', () => {
    const got = intradayPairsNeedingFetch(true).map((p) => p.symbol).sort()
    expect(got).toEqual(['CLEAN', 'GATED_OLD', 'GATED_RECENT', 'NEW', 'TRANSIENT'])
  })
})

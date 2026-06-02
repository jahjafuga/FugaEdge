import { beforeEach, describe, expect, it, vi } from 'vitest'

// Integration over the REAL intradayPairsNeedingFetch JS filter + the real
// shouldRetryErrored predicate; only the DB read is mocked (canned rows). The
// SQL itself is trivial (a SELECT); the selection logic AND the cooldownSkipped
// count are what we assert.

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const ago = (ms: number) => new Date(now - ms).toISOString()
const D = '2026-05-01'
const GATED = '403: 403 Forbidden — {"status":"NOT_AUTHORIZED"}'

// Mutable fixtures the mocked DB reads from — reassigned per test (inside the
// nested `all()` closure, so the vi.mock hoist is safe) to exercise mixed vs.
// all-cooldown worklists against the same module instance.
let fx: {
  pairs: { symbol: string; date: string }[]
  bars: { symbol: string; date: string; error: string | null; fetched_at: string }[]
} = { pairs: [], bars: [] }

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return fx.pairs // tradeSymbolDatePairs
        if (sql.includes('FROM intraday_bars')) return fx.bars
        return []
      },
    }),
  }),
}))

import { intradayPairsNeedingFetch } from '../repo'

describe('intradayPairsNeedingFetch — worklist + cooldownSkipped', () => {
  beforeEach(() => {
    // Mixed worklist: one never-fetched, one clean, one gated-within-cooldown,
    // one gated-aged-past-cooldown, one transient error.
    fx = {
      pairs: [
        { symbol: 'NEW', date: D },
        { symbol: 'CLEAN', date: D },
        { symbol: 'GATED_RECENT', date: D },
        { symbol: 'GATED_OLD', date: D },
        { symbol: 'TRANSIENT', date: D },
      ],
      bars: [
        { symbol: 'CLEAN', date: D, error: null, fetched_at: ago(1 * DAY) },
        { symbol: 'GATED_RECENT', date: D, error: GATED, fetched_at: ago(10 * DAY) }, // within cooldown
        { symbol: 'GATED_OLD', date: D, error: GATED, fetched_at: ago(50 * DAY) }, // aged past cooldown
        { symbol: 'TRANSIENT', date: D, error: '429: 429 Too Many Requests', fetched_at: ago(1 * DAY) },
      ],
    }
  })

  it('force=false: keeps new + aged-gated + transient; skips clean + gated-within-cooldown', () => {
    const { pairs } = intradayPairsNeedingFetch(false)
    expect(pairs.map((p) => p.symbol).sort()).toEqual(['GATED_OLD', 'NEW', 'TRANSIENT'])
  })

  it('force=false: cooldownSkipped counts ONLY the gated-within-cooldown pair (clean-cached is not counted)', () => {
    const { cooldownSkipped } = intradayPairsNeedingFetch(false)
    expect(cooldownSkipped).toBe(1) // GATED_RECENT only; CLEAN is silently dropped, uncounted
  })

  it('all-cooldown worklist: pairs === [] and cooldownSkipped === N', () => {
    fx = {
      pairs: [
        { symbol: 'A', date: D },
        { symbol: 'B', date: D },
        { symbol: 'C', date: D },
      ],
      bars: [
        { symbol: 'A', date: D, error: GATED, fetched_at: ago(5 * DAY) },
        { symbol: 'B', date: D, error: GATED, fetched_at: ago(5 * DAY) },
        { symbol: 'C', date: D, error: GATED, fetched_at: ago(5 * DAY) },
      ],
    }
    const { pairs, cooldownSkipped } = intradayPairsNeedingFetch(false)
    expect(pairs).toEqual([])
    expect(cooldownSkipped).toBe(3)
  })

  it('force=true: returns ALL pairs and cooldownSkipped === 0 (cooldown bypassed)', () => {
    const { pairs, cooldownSkipped } = intradayPairsNeedingFetch(true)
    expect(pairs.map((p) => p.symbol).sort()).toEqual([
      'CLEAN',
      'GATED_OLD',
      'GATED_RECENT',
      'NEW',
      'TRANSIENT',
    ])
    expect(cooldownSkipped).toBe(0)
  })
})

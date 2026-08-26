import { describe, expect, it, vi } from 'vitest'

// v0.2.7 — THE DAILY-CHANGE PACER'S SPACING, DERIVED.
//
// Same correction as its two siblings, arriving late for the same reason: the
// value was unobservable, so nothing could see it was wrong. It paced at an
// ad-hoc three-hundred-and-fifty-millisecond floor — about three calls a second
// — against a documented budget of five a minute. fetch.ts:22-28 records the
// identical constant being removed elsewhere as the cause of a
// one-hundred-and-forty-five-failed storm, and names the replacement.
//
// THE ASSERTION IS THE DERIVATION. A pinned number would pass today and stop
// guarding the moment the limit moved, which is the one occasion it exists for.

const SYMBOLS = ['AAA', 'BBB', 'CCC']

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }),
  }),
}))
vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))
vi.mock('../repo', () => ({
  symbolsNeedingDailyChange: () => SYMBOLS,
  tradeDateRangePerSymbol: () => new Map(),
  tradesNeedingDailyChangeForSymbol: () => [],
  setTradeDailyChange: () => {},
  setTradeRvol: () => {},
  symbolsNeedingRvol: () => [],
}))
vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return { ...actual, fetchDailyAggregates: vi.fn(async () => []) }
})

import { backfillAllDailyChange, REQUEST_SPACING_MS } from '../daily-change-backfill'
import {
  POLYGON_FREE_TIER_CALLS_PER_MIN,
  spacingMsForCallsPerMin,
} from '../rate-limit'

describe('RL1 the daily-change spacing is DERIVED from the rate limit', () => {
  it('it equals the derivation, not an ad-hoc number', () => {
    expect(
      REQUEST_SPACING_MS,
      'the daily-change pacer is not derived from the rate limit — it will empty ' +
        'the budget and absorb the ceiling as retry backoff instead of pacing under it',
    ).toBe(spacingMsForCallsPerMin(POLYGON_FREE_TIER_CALLS_PER_MIN))
  })
})

describe('RL2 the permitted rate never exceeds the limit', () => {
  it('calls per minute at this spacing is within budget', () => {
    expect(60_000 / REQUEST_SPACING_MS).toBeLessThanOrEqual(POLYGON_FREE_TIER_CALLS_PER_MIN)
  })
})

describe('RL3 the pacer sleeps BETWEEN items', () => {
  it('three symbols sleep twice', async () => {
    const slept: number[] = []
    await backfillAllDailyChange({ sleep: async (ms) => void slept.push(ms) })
    // NOT VACUOUS: an empty array would make any per-element check below assert
    // nothing, which is exactly how a guard of this shape passed in a prior beat.
    expect(slept.length, 'nothing was paced, so the count proves nothing').toBeGreaterThan(0)
    expect(slept, 'three symbols should pace twice — before the second and third').toHaveLength(2)
  })
})

describe('RL4 a single symbol never sleeps', () => {
  // Without this, RL3 passes for a pacer that sleeps unconditionally.
  it('one symbol, zero sleeps', async () => {
    SYMBOLS.length = 0
    SYMBOLS.push('ONLY')
    const slept: number[] = []
    await backfillAllDailyChange({ sleep: async (ms) => void slept.push(ms) })
    SYMBOLS.length = 0
    SYMBOLS.push('AAA', 'BBB', 'CCC')
    expect(slept, 'the pacer slept with nothing to pace against').toEqual([])
  })
})

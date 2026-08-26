import { describe, expect, it, vi } from 'vitest'

// v0.2.7 — THE BARS PACER'S SPACING, GUARDED.
//
// The intraday refresh paces its Polygon calls through a respectSpacing closure,
// and until now nothing asserted that it does. That gap is why the value could
// sit at an ad-hoc 350ms while the sibling paths derive theirs from the tier —
// the number was never wrong in a way any test could see.
//
// THIS BEAT DOES NOT CHANGE THE VALUE. It makes the sleep injectable so the
// pacing can be asserted at all, mirroring the shape warmup-backfill.ts:44-50
// already uses. The spacing is 350ms before and 350ms after, deliberately: the
// ruling that replaces it with the tier-derived constant is a separate beat, and
// this one exists so that beat touches two files instead of six.
//
// EVERY ASSERTION READS THE MODULE'S OWN EXPORTED CONSTANT, never a literal.
// A literal 350 would keep passing after the constant is swapped and would
// silently stop guarding anything at the exact moment it mattered.

const PAIRS = [
  { symbol: 'AAA', date: '2026-05-01' },
  { symbol: 'BBB', date: '2026-05-01' },
  { symbol: 'CCC', date: '2026-05-01' },
]

/** The worklist the mocked db hands back. Swapped per test so the ONE-key case
 *  and the never-fetched case can be driven through the real selection code. */
let pairs: { symbol: string; date: string }[] = PAIRS
/** Rows the mocked intraday_bars table returns — drives the never-fetched path. */
let cachedRows: unknown[] = []

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('DISTINCT symbol, date')) return pairs // tradeSymbolDatePairs
        if (sql.includes('FROM intraday_bars')) return cachedRows
        return []
      },
      get: () => undefined,
      run: () => ({ changes: 0 }),
    }),
  }),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

const fetched: string[] = []
vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual,
    fetchIntradayMinutes: vi.fn(async (_k: string, symbol: string) => {
      fetched.push(symbol)
      return [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }]
    }),
  }
})

import { refreshIntraday, REQUEST_SPACING_MS } from '../intraday'

// ─── RJ1 ─────────────────────────────────────────────────────────────────────

describe('RJ1 the pacer sleeps BETWEEN calls, at the module spacing', () => {
  it('three keys sleep twice, each for the spacing', async () => {
    pairs = PAIRS
    cachedRows = []
    const slept: number[] = []

    await refreshIntraday({
      force: true,
      sleep: async (ms) => {
        slept.push(ms)
      },
    })

    expect(slept, 'three keys should pace twice — before the second and third').toHaveLength(2)
    for (const ms of slept) {
      // Read from the module, never a literal. The value is free to change; the
      // relationship between it and the pacer is what is guarded.
      expect(ms).toBeLessThanOrEqual(REQUEST_SPACING_MS)
      expect(ms).toBeGreaterThan(0)
    }
  })

  it('and the spacing it uses is the module constant, not something smaller', async () => {
    pairs = PAIRS
    cachedRows = []
    const slept: number[] = []
    await refreshIntraday({ force: true, sleep: async (ms) => void slept.push(ms) })
    // NOT VACUOUS: an empty array would make the loop below assert nothing, which
    // is exactly how this test passed before the injection existed.
    expect(slept.length, 'nothing was paced, so the loop below proves nothing').toBeGreaterThan(0)
    expect(REQUEST_SPACING_MS, 'the module does not export its spacing').toBeTypeOf('number')
    // The closure sleeps (spacing - elapsed); with an instant sleep the elapsed
    // time is sub-millisecond, so each wait lands at the spacing or one ms under.
    for (const ms of slept) {
      expect(REQUEST_SPACING_MS - ms).toBeLessThanOrEqual(5)
    }
  })
})

// ─── RJ2 : THE DISCRIMINATOR ─────────────────────────────────────────────────

describe('RJ2 a single key never sleeps', () => {
  // Without this, RJ1 passes for a pacer that sleeps unconditionally.
  it('one key, zero sleeps', async () => {
    pairs = [{ symbol: 'ONLY', date: '2026-05-01' }]
    cachedRows = []
    const slept: number[] = []

    await refreshIntraday({ force: true, sleep: async (ms) => void slept.push(ms) })

    expect(slept, 'the pacer slept with nothing to pace against').toEqual([])
  })
})

// ─── RJ3 ─────────────────────────────────────────────────────────────────────

describe('RJ3 the option is optional', () => {
  it('omitting it uses the real timer and does not throw', async () => {
    // ONE key, so the real timer is never actually awaited — this asserts the
    // default exists and is callable, not that the suite waits 350ms for it.
    pairs = [{ symbol: 'SOLO', date: '2026-05-01' }]
    cachedRows = []
    const result = await refreshIntraday({ force: true })
    expect(result.attempted).toBe(1)
    expect(result.fetched).toBe(1)
  })
})

// ─── RJ4 : SCOPE GUARD ───────────────────────────────────────────────────────

describe('RJ4 the worklist is untouched', () => {
  // Load-bearing across this whole thread: repo.ts:362-364 enqueues a key with
  // NO intraday_bars row (`// never fetched`). That is the only reason the
  // book's missing keys are reachable at all, and no pacing beat may disturb it.
  it('a never-fetched key is still ENQUEUED on a non-forced refresh', async () => {
    pairs = [
      { symbol: 'CACHED', date: '2026-05-01' },
      { symbol: 'NEVER', date: '2026-05-01' },
    ]
    // CACHED has a clean row; NEVER has none at all.
    cachedRows = [
      { symbol: 'CACHED', date: '2026-05-01', error: null, fetched_at: '2026-05-01T00:00:00Z' },
    ]
    fetched.length = 0

    const result = await refreshIntraday({
      force: false,
      sleep: async () => {},
    })

    expect(fetched, 'the never-fetched key was skipped').toContain('NEVER')
    expect(fetched, 'a cleanly-cached key was re-fetched').not.toContain('CACHED')
    expect(result.attempted).toBe(1)
  })
})

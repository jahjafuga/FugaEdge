import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.4 Commit A — getIntradayBars now caches a prior-day warmup window
// alongside the active day, with a silent backfill for legacy rows. These pin
// the four cache branches (full hit / silent backfill / full miss / error) plus
// the contract that a WARMUP failure never surfaces as payload.error. The repo,
// settings, and network are mocked; no real DB, no Electron app.

// ── Mutable mock state — set per test, read inside the (deferred) mock callbacks.
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
type Row = { symbol: string; date: string; bars: Bar[]; warmup_bars: Bar[]; fetched_at: string; error: string | null }
const bar = (t: number): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 })

let cachedRow: Row | null = null
let apiKey: string | null = 'test-key'
const fetchCalls: { from: string; to: string }[] = []
const upserts: Row[] = []
// Active fetch is the from===to call; warmup fetch is the from=date-4 call.
let activeResult: () => Promise<Bar[]> = async () => [bar(1)]
let warmupResult: () => Promise<Bar[]> = async () => [bar(0)]

vi.mock('../repo', () => ({
  getIntradayRow: vi.fn(() => cachedRow),
  upsertIntradayRow: vi.fn((row: Row) => {
    upserts.push(row)
  }),
}))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: apiKey } }),
}))

vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual, // keep MassiveError real for the error-path test
    fetchIntradayMinutes: vi.fn(async (_key: string, _symbol: string, from: string, to: string) => {
      fetchCalls.push({ from, to })
      return from === to ? activeResult() : warmupResult()
    }),
  }
})

import { getIntradayBars } from '../bars-get'

const SYM = 'AAA'
const DATE = '2026-05-01' // warmup window → 2026-04-27 .. 2026-04-30
const WARMUP_FROM = '2026-04-27'
const WARMUP_TO = '2026-04-30'

beforeEach(() => {
  cachedRow = null
  apiKey = 'test-key'
  fetchCalls.length = 0
  upserts.length = 0
  activeResult = async () => [bar(1)]
  warmupResult = async () => [bar(0)]
})

describe('getIntradayBars — warmup cache + silent backfill', () => {
  it('full cache hit returns bars and warmupBars without fetching', async () => {
    cachedRow = { symbol: SYM, date: DATE, bars: [bar(1)], warmup_bars: [bar(0)], fetched_at: 'T0', error: null }

    const p = await getIntradayBars(SYM, DATE)

    expect(fetchCalls).toHaveLength(0)
    expect(p.bars).toEqual([bar(1)])
    expect(p.warmupBars).toEqual([bar(0)])
    expect(p.error).toBeNull()
  })

  it('cached row with empty warmup triggers silent backfill', async () => {
    cachedRow = { symbol: SYM, date: DATE, bars: [bar(1)], warmup_bars: [], fetched_at: 'T0', error: null }

    const p = await getIntradayBars(SYM, DATE)

    // exactly one fetch — the warmup range only, NOT the active day
    expect(fetchCalls).toEqual([{ from: WARMUP_FROM, to: WARMUP_TO }])
    // upsert preserves cached bars, writes the freshly-fetched warmup
    expect(upserts).toHaveLength(1)
    expect(upserts[0].bars).toEqual([bar(1)])
    expect(upserts[0].warmup_bars).toEqual([bar(0)])
    expect(p.bars).toEqual([bar(1)])
    expect(p.warmupBars).toEqual([bar(0)])
    expect(p.error).toBeNull()
  })

  it('silent backfill failure returns partial payload, no error', async () => {
    cachedRow = { symbol: SYM, date: DATE, bars: [bar(1)], warmup_bars: [], fetched_at: 'T0', error: null }
    warmupResult = async () => {
      throw new Error('warmup network fail')
    }

    const p = await getIntradayBars(SYM, DATE)

    expect(p.bars).toEqual([bar(1)])
    expect(p.warmupBars).toEqual([])
    expect(p.error).toBeNull() // CRITICAL — warmup failure is never surfaced
    expect(upserts[0].error).toBeNull()
  })

  it('full miss fetches both ranges and upserts union', async () => {
    cachedRow = null

    const p = await getIntradayBars(SYM, DATE)

    // active range first, then warmup range
    expect(fetchCalls).toEqual([
      { from: DATE, to: DATE },
      { from: WARMUP_FROM, to: WARMUP_TO },
    ])
    expect(upserts).toHaveLength(1)
    expect(upserts[0].bars).toEqual([bar(1)])
    expect(upserts[0].warmup_bars).toEqual([bar(0)])
    expect(p.bars).toEqual([bar(1)])
    expect(p.warmupBars).toEqual([bar(0)])
    expect(p.justFetched).toBe(true)
  })

  it('full miss with warmup failure returns active-only payload, no error', async () => {
    cachedRow = null
    warmupResult = async () => {
      throw new Error('warmup fail')
    }

    const p = await getIntradayBars(SYM, DATE)

    expect(p.bars).toEqual([bar(1)])
    expect(p.warmupBars).toEqual([])
    expect(p.error).toBeNull()
    expect(upserts[0].bars).toEqual([bar(1)])
    expect(upserts[0].warmup_bars).toEqual([])
  })

  it('no API key returns empty bars, empty warmup, apiKeyMissing:true', async () => {
    apiKey = null
    cachedRow = null

    const p = await getIntradayBars(SYM, DATE)

    expect(fetchCalls).toHaveLength(0)
    expect(p.apiKeyMissing).toBe(true)
    expect(p.bars).toEqual([])
    expect(p.warmupBars).toEqual([])
  })

  it('active fetch error (force) preserves cached bars and warmup', async () => {
    cachedRow = { symbol: SYM, date: DATE, bars: [bar(1)], warmup_bars: [bar(0)], fetched_at: 'T0', error: null }
    activeResult = async () => {
      throw new Error('active fetch boom')
    }

    const p = await getIntradayBars(SYM, DATE, { force: true })

    expect(p.bars).toEqual([bar(1)]) // from cache
    expect(p.warmupBars).toEqual([bar(0)]) // from cache
    expect(p.error).toContain('active fetch boom')
    // active threw before warmup was attempted → only the active range was hit
    expect(fetchCalls).toEqual([{ from: DATE, to: DATE }])
  })
})

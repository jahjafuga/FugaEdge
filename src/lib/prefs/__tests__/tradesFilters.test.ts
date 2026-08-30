// @vitest-environment jsdom
// v0.2.7 — THE TRADES FILTERS SURVIVE THE PAGE.
//
// MEASURED: nothing persisted filter state. Trades.tsx did
// `useState<TradesFilterState>(emptyFilters())`, so every mount, every tab
// change and every restart threw the user's filters away — while column
// visibility beside it has persisted through src/lib/prefs/columns.ts all
// along. Same page, same concern, two different answers.
//
// THIS FOLLOWS columns.ts EXACTLY: localStorage, a `storage()` helper that
// tolerates no-window, a defensive read that falls back to defaults on parse
// failure, and a write that is called directly by the change handler. Two
// deliberate departures, both because filters are not column toggles:
//
//   PER ACCOUNT. Column visibility is one global key — the same columns make
//   sense in every book. A filter does not: "playbook 7, catalyst FDA" is
//   meaningless in an account that has neither, and restoring it would show an
//   empty table with no explanation. The scope is the key.
//
//   VERSIONED. columns.ts stores a bare object and survives new fields by
//   spreading over its defaults. That works for a flat map of booleans; it
//   cannot work here, where absent and empty differ in meaning on two fields
//   (a null in playbookIds is the untagged bucket, not an unset filter). A
//   version stamp is what lets a future shape change be detected rather than
//   half-read.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  TRADES_FILTER_PREFS_VERSION,
  filterPrefsKey,
  readTradesFilters,
  writeTradesFilters,
} from '../tradesFilters'
import { emptyFilters, type TradesFilterState } from '@/core/trades/tradesFilter'
import type { AccountScope } from '@shared/accounts-types'

const ACCT_A: AccountScope = { accountId: '01KYN67KGBZJ6BEKXVJ0SPE5C0' }
const ACCT_B: AccountScope = { accountId: '01KZ97JYKJKTMW6Y2WHKF77P19' }
const ALL: AccountScope = 'all'

beforeEach(() => {
  localStorage.clear()
})

/** Every field populated, including both null buckets and a live range. The
 *  explicit March range is a HAND-PICKED one, so datePreset is null — the
 *  preset round trip is guarded in components/trades/__tests__/
 *  QuickFilters.datePreset.test.tsx, where a clock can be advanced. */
const FULL = (): TradesFilterState => ({
  symbol: 'AAPL',
  side: 'long',
  duration: '1to5m',
  dateFrom: '2026-03-01',
  dateTo: '2026-03-31',
  datePreset: null,
  outcome: 'winners',
  aPlus: true,
  mistakesOnly: true,
  playbookIds: [7, null],
  mistakeKeys: [{ axis: 'technical', name: 'Chased extension (too far from 9 EMA)' }],
  catalystTypes: ['News / PR', null],
  regions: ['China', null],
  countries: ['CN', null],
  sectors: ['Healthcare', null],
  industries: ['Biotechnology'],
  // v0.2.7 -- the EIGHTH array, with BOTH a real value and the null bucket,
  // because the uncomputed member is the one this facet exists to name.
  macdStates: ['positive', null],
  // v0.2.7 -- THE TEN. Added rather than the round trip relaxed: this test
  // fired the moment the state grew, which is exactly what it is for. Every
  // one carries a real value, because a field defaulted in the fixture proves
  // nothing about whether it survives a write and a read.
  excludeSymbols: ['TSLA'],
  excludeSides: ['short'],
  excludeOutcomes: ['losers'],
  excludeDurations: ['under1m'],
  excludeDateFrom: '2026-01-01',
  excludeDateTo: '2026-01-31',
  excludeMistakesOnly: true,
  excludeAPlus: true,
  excludeRanges: { mae: { min: 1, max: null } },
  dna: { minScore: 3, bucket: 'complete' },
  ranges: { net_pnl: { min: -500, max: 1200 }, rvol: { min: 2, max: null } },
  // v0.2.7 -- the EIGHT EXCLUDE arrays, with real values: unlike the limit
  // these ARE filters and MUST round-trip, so F1 asserts exactly that.
  excludePlaybookIds: [9],
  excludeMistakeKeys: [{ axis: 'psychological', name: 'Revenge trade (after a loss)' }],
  excludeCatalystTypes: ['Offering / Dilution'],
  excludeRegions: ['Hong Kong'],
  excludeCountries: ['HK'],
  excludeSectors: ['Energy'],
  excludeIndustries: ['Marine Shipping'],
  excludeMacdStates: ['negative'],
  // v0.2.7 -- the ask gained a limit and a sort. They are NULL here because
  // they are never persisted: F1 asserts every field round-trips, and these
  // two round-trip to null BY DESIGN. The law that they do not survive a write
  // is asserted separately, in F1b, so this fixture staying null cannot be
  // mistaken for the law being untested.
  limit: null,
  sort: null,
})

// ─── F1 ──────────────────────────────────────────────────────────────────────

describe('F1 what is written comes back', () => {
  it('every field round-trips, including the null buckets and a range', () => {
    const state = FULL()
    writeTradesFilters(ALL, state)
    const back = readTradesFilters(ALL)
    expect(back).toEqual(state)
    // the null buckets are load-bearing: null means "untagged", not "unset"
    expect(back.playbookIds).toContain(null)
    expect(back.catalystTypes).toContain(null)
    expect(back.ranges.net_pnl).toEqual({ min: -500, max: 1200 })
  })
})

// ─── F1b ─────────────────────────────────────────────────────────────────────

describe('F1b a LIMIT is never persisted', () => {
  it('an active limit does not survive a write', () => {
    writeTradesFilters(ALL, { ...FULL(), limit: 10, sort: { colId: 'open_time', dir: 'desc' } })
    const back = readTradesFilters(ALL)
    expect(back.limit, 'a hidden row survived a reload').toBeNull()
    expect(back.sort).toBeNull()
  })

  it('and the stored BYTES are identical with and without one', () => {
    writeTradesFilters(ALL, FULL())
    const without = localStorage.getItem(filterPrefsKey(ALL))
    writeTradesFilters(ALL, { ...FULL(), limit: 10, sort: { colId: 'open_time', dir: 'desc' } })
    const withLimit = localStorage.getItem(filterPrefsKey(ALL))
    expect(withLimit, 'the limit reached the stored blob').toBe(without)
  })

  it('the rest of the filter still round-trips alongside it', () => {
    writeTradesFilters(ALL, { ...FULL(), limit: 10 })
    const back = readTradesFilters(ALL)
    expect(back.symbol).toBe('AAPL')
    expect(back.regions).toEqual(['China', null])
  })
})

// ─── F2 ──────────────────────────────────────────────────────────────────────

describe('F2 one account\'s filters never leak into another', () => {
  it('A, B and all-accounts are three separate keys', () => {
    writeTradesFilters(ACCT_A, { ...emptyFilters(), symbol: 'AAA' })
    writeTradesFilters(ACCT_B, { ...emptyFilters(), symbol: 'BBB' })
    writeTradesFilters(ALL, { ...emptyFilters(), symbol: 'ALL' })

    expect(readTradesFilters(ACCT_A).symbol).toBe('AAA')
    expect(readTradesFilters(ACCT_B).symbol).toBe('BBB')
    expect(readTradesFilters(ALL).symbol).toBe('ALL')

    // and the keys themselves are distinct, so this cannot pass by luck
    const keys = [filterPrefsKey(ACCT_A), filterPrefsKey(ACCT_B), filterPrefsKey(ALL)]
    expect(new Set(keys).size, `keys collided: ${JSON.stringify(keys)}`).toBe(3)
  })

  it('an account that has never been filtered reads empty, not its neighbour', () => {
    writeTradesFilters(ACCT_A, FULL())
    expect(readTradesFilters(ACCT_B)).toEqual(emptyFilters())
  })
})

// ─── F3 / F4 ─────────────────────────────────────────────────────────────────

describe('F3 a missing value is the empty filter, never undefined', () => {
  it('nothing stored', () => {
    expect(readTradesFilters(ALL)).toEqual(emptyFilters())
  })
})

describe('F4 a corrupt value degrades silently', () => {
  for (const [label, raw] of [
    ['not JSON at all', '{oh no'],
    ['JSON that is a string', '"hello"'],
    ['JSON that is a number', '42'],
    ['JSON null', 'null'],
    ['JSON array', '[1,2,3]'],
    ['an object with no state', '{"v":1}'],
    ['state that is an array', '{"v":1,"state":[]}'],
    ['state that is null', '{"v":1,"state":null}'],
    ['empty string', ''],
  ] as const) {
    it(`${label} -> emptyFilters(), no throw`, () => {
      localStorage.setItem(filterPrefsKey(ALL), raw)
      expect(() => readTradesFilters(ALL)).not.toThrow()
      expect(readTradesFilters(ALL)).toEqual(emptyFilters())
    })
  }
})

// ─── F5 / F6 — the version contract ──────────────────────────────────────────

describe('F5 a blob from an older shape fills its gaps', () => {
  it('fields added after it was written come back at their empty defaults', () => {
    // What v1 looked like before ranges, outcome and the two null buckets existed.
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION,
        state: { symbol: 'TSLA', side: 'short', duration: 'all', dateFrom: '', dateTo: '' },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back.symbol).toBe('TSLA')
    expect(back.side).toBe('short')
    // everything absent comes back as the empty default, not undefined
    expect(back.outcome).toBe('all')
    expect(back.aPlus).toBe(false)
    expect(back.mistakesOnly).toBe(false)
    expect(back.playbookIds).toEqual([])
    expect(back.mistakeKeys).toEqual([])
    expect(back.catalystTypes).toEqual([])
    expect(back.ranges).toEqual({})
    // and the result is a COMPLETE state — no key is missing
    expect(Object.keys(back).sort()).toEqual(Object.keys(emptyFilters()).sort())
  })
})

describe('F6 a blob from a newer build is discarded, not half-read', () => {
  it('a higher version stamp returns emptyFilters()', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: TRADES_FILTER_PREFS_VERSION + 1,
        state: { ...FULL(), symbol: 'FROM_THE_FUTURE' },
      }),
    )
    const back = readTradesFilters(ALL)
    expect(back, 'a future shape was partially read').toEqual(emptyFilters())
    expect(back.symbol).not.toBe('FROM_THE_FUTURE')
  })

  it('and a blob with no version stamp at all is discarded too', () => {
    localStorage.setItem(filterPrefsKey(ALL), JSON.stringify({ state: FULL() }))
    expect(readTradesFilters(ALL)).toEqual(emptyFilters())
  })
})

// ─── F7 — a range on a column that no longer exists ─────────────────────────

describe('F7 a range on an unknown column is dropped, the rest survives', () => {
  it('the stale id goes and every other field stays', () => {
    const state = FULL()
    writeTradesFilters(ALL, state)
    // hand-edit the stored blob to reference a column that no longer exists
    const raw = JSON.parse(localStorage.getItem(filterPrefsKey(ALL))!)
    raw.state.ranges.a_column_we_deleted = { min: 1, max: 2 }
    localStorage.setItem(filterPrefsKey(ALL), JSON.stringify(raw))

    const back = readTradesFilters(ALL)
    expect(Object.keys(back.ranges).sort()).toEqual(['net_pnl', 'rvol'])
    expect(back.symbol).toBe('AAPL')
    expect(back.playbookIds).toEqual([7, null])
  })
})

// ─── F8 — one spelling of unset ──────────────────────────────────────────────

describe('F8 the three spellings of unset become one', () => {
  it('absent, null and undefined bounds normalise on write', () => {
    writeTradesFilters(ALL, {
      ...emptyFilters(),
      ranges: {
        net_pnl: {},
        fees: { min: null, max: null },
        shares: { min: undefined, max: undefined },
        rvol: { min: 2 },
      },
    })
    const back = readTradesFilters(ALL)
    // the three dormant ranges are gone entirely — one spelling, not three
    expect(Object.keys(back.ranges)).toEqual(['rvol'])
    expect(back.ranges.rvol).toEqual({ min: 2, max: null })
  })
})

// ─── F9 — idempotence ────────────────────────────────────────────────────────

describe('F9 the round trip settles', () => {
  it('read(write(read(write(x)))) equals read(write(x))', () => {
    writeTradesFilters(ALL, FULL())
    const once = readTradesFilters(ALL)
    writeTradesFilters(ALL, once)
    const twice = readTradesFilters(ALL)
    expect(twice).toEqual(once)
    // and the stored BYTES settle too, not merely the parsed value
    const a = localStorage.getItem(filterPrefsKey(ALL))
    writeTradesFilters(ALL, twice)
    expect(localStorage.getItem(filterPrefsKey(ALL))).toBe(a)
  })
})

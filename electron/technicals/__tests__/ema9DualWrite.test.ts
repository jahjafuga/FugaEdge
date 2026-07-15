// BEAT 2 — ENTRY vs 9EMA: the tile dual-write at the single snapshot write point.
//
// upsertTradeTechnicals is the ONE function every snapshot write passes through
// (sweep: backfill.ts:71; chart-open lazy-guard: lazy-guard.ts:179 — including
// the makeIncompleteTechnicals placeholder path via runBackfillCore.ts:131).
// Beat 2 makes it dual-write the legacy tile column for the remaining readers:
//
//   trades.entry_ema9_distance_pct = data_complete ? tf_1m.ema9_dist_pct : NULL
//
// A stub UN-WRITES a previously-poisoned day-only value (pending beats
// wrong-but-confident), and the healed number is the SNAPSHOT's — sourced from
// the executions' entry-fill VWA, never the stored trade-avg columns.
//
// Mock-db capture test — better-sqlite3 won't load under vitest, so openDatabase
// is a statement-capturing shim (the list-commission.test.ts idiom). The shim
// also supports db.transaction(fn) since the dual-write pairs the two statements
// atomically (a kill between "row stamped v3-complete" and "tile written" would
// otherwise leave a row the worklist never revisits).
import { describe, expect, it, beforeEach, vi } from 'vitest'

const bumpDataVersion = vi.hoisted(() => vi.fn())

let runs: { sql: string; args: unknown[] }[] = []

const fakeDb = {
  prepare: (sql: string) => ({
    run: (...args: unknown[]) => {
      runs.push({ sql, args })
      return { changes: 1, lastInsertRowid: 0 }
    },
    all: () => [],
    get: () => undefined,
  }),
  // better-sqlite3 transaction: returns a callable wrapping the fn.
  transaction:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
}

vi.mock('../../db/database', () => ({ openDatabase: () => fakeDb }))
vi.mock('../../lib/cache', () => ({ bumpDataVersion, getDataVersion: () => 0 }))

import { upsertTradeTechnicals } from '../repo'
import {
  computeTradeTechnicals,
  makeIncompleteTechnicals,
  type TradeTechnicals,
} from '@/core/technicals/computeTradeTechnicals'
import type { IntradayBar } from '@shared/market-types'

beforeEach(() => {
  runs = []
  bumpDataVersion.mockClear()
})

/** The captured tile-column writes (the dual-write statement). */
const tileWrites = () =>
  runs.filter((r) => /UPDATE\s+trades\s+SET\s+entry_ema9_distance_pct/i.test(r.sql))

/** Hand-built complete snapshot carrying a known 1m EMA9 distance. */
function completeTechnicals(ema9DistPct: number): TradeTechnicals {
  const base = makeIncompleteTechnicals()
  return {
    ...base,
    data_complete: true,
    tf_1m: { ...base.tf_1m, ema9_dist_pct: ema9DistPct },
  }
}

describe('the dual-write at upsertTradeTechnicals', () => {
  it('(2) COMPLETE: data_complete=1 → tile column := tf_1m.ema9_dist_pct (RDGT: 3.66)', () => {
    upsertTradeTechnicals(42, completeTechnicals(3.66))
    const writes = tileWrites()
    expect(writes.length).toBe(1)
    expect(writes[0].args).toEqual([3.66, 42])
  })

  it('(3) STUB anti-grifter: data_complete=0 → tile column := NULL (un-writes a prior day-only value; never 0)', () => {
    // makeIncompleteTechnicals() is the exact placeholder the sweep persists when
    // warmup is missing (runBackfillCore.ts:130-132). The UPDATE is unconditional
    // write-through, so whatever poison the column held (10.75) is un-written.
    upsertTradeTechnicals(42, makeIncompleteTechnicals())
    const writes = tileWrites()
    expect(writes.length).toBe(1)
    expect(writes[0].args).toEqual([null, 42])
    expect(writes[0].args[0]).not.toBe(0)
  })

  it('(4) CONVENTION: the healed value is the snapshot\'s entry-fill-VWA number — a drifted stored trade-avg cannot leak in', () => {
    // Flat tape at 10.00 so the 9EMA at entry is exactly 10. Two entry fills at
    // different prices: VWA = (100*10 + 300*12)/400 = 11.50 → dist = +15%.
    // A drifted stored avg_buy_price (99 — the column the RETIRED writer read)
    // would give (99-10)/10*100 = +890%. The compute never sees stored avg
    // columns at all (TradeForTechnicals = side + executions only) — this pins
    // that the healed number is VWA-sourced from executions.
    const bar = (t: number): IntradayBar => ({ t, o: 10, h: 10, l: 10, c: 10, v: 1000 })
    const MIN = 60_000
    const warmupStart = Date.parse('2026-05-29T14:00:00Z') // prior session
    const activeStart = Date.parse('2026-06-01T13:30:00Z')
    const warmup = Array.from({ length: 40 }, (_, i) => bar(warmupStart + i * MIN))
    const active = Array.from({ length: 20 }, (_, i) => bar(activeStart + i * MIN))

    const result = computeTradeTechnicals(
      {
        side: 'long',
        executions: [
          { side: 'B', qty: 100, price: 10, time: '2026-06-01T13:35:10Z' },
          { side: 'B', qty: 300, price: 12, time: '2026-06-01T13:36:10Z' },
          { side: 'S', qty: 400, price: 12.5, time: '2026-06-01T13:45:10Z' },
        ],
      },
      warmup,
      active,
    )
    expect(result.data_complete).toBe(true)
    expect(result.tf_1m.ema9_dist_pct).toBeCloseTo(15, 6)

    upsertTradeTechnicals(7, result)
    const writes = tileWrites()
    expect(writes.length).toBe(1)
    // Exactly the snapshot's number…
    expect(writes[0].args[0]).toBe(result.tf_1m.ema9_dist_pct)
    // …which is the VWA convention (+15%), nowhere near the drifted-avg number.
    expect(writes[0].args[0]).toBeCloseTo(15, 6)
    expect(writes[0].args[0]).not.toBeCloseTo(890, 0)
  })

  it('(7-repo) the repo does NOT bump dataVersion itself — the wrapper/lazy-guard stay the sole bump gates (no double-bump)', () => {
    upsertTradeTechnicals(42, completeTechnicals(1.23))
    upsertTradeTechnicals(43, makeIncompleteTechnicals())
    expect(bumpDataVersion).not.toHaveBeenCalled()
  })
})

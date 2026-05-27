import { describe, expect, it } from 'vitest'
import { buildRoundTrips } from '@/core/import/build-round-trips'
import type { Execution } from '@shared/import-types'

// v0.1.6 exec_hash regression lock.
//
// Original purpose: when the universal builder (src/core/import/build-round-
// trips.ts) replaced the orphaned electron/import/compute-trips.ts module
// in v0.2.0, both implementations had to produce the same exec_hash for
// inputs with no account_name — otherwise every v0.1.6 trade would have
// re-flagged as "new" on upgrade. The old test compared the two builders
// at runtime. v0.2.1 deletes compute-trips.ts entirely; this test now
// pins the v0.1.6 hash shape against a frozen SHA-1 literal instead.
//
// HASHES ARE LOAD-BEARING. Every existing trade row in every user's DB
// dedups against its stored exec_hash. If any change to hashFills or its
// inputs alters either of these literals, every legacy trade looks "new"
// on the next import. Don't change without a coordinated migration.

function exec(o: {
  trade_id: string
  order_id: string
  symbol: string
  side: 'B' | 'S'
  qty: number
  price: number
  time: string
  account_name?: string
}): Execution {
  return {
    trade_id: o.trade_id,
    order_id: o.order_id,
    is_short: o.side === 'S',
    date: o.time.slice(0, 10),
    symbol: o.symbol,
    side: o.side,
    qty: o.qty,
    price: o.price,
    time: o.time,
    account_name: o.account_name,
  }
}

describe('exec_hash v0.1.6 regression (frozen literals)', () => {
  it('single buy/sell round trip with no account_name', () => {
    // Hash payload (per hashFills): sorted "trade_id:order_id" pairs joined
    // by '|', no account_name prefix. SHA-1 hex.
    //   ids = ['1:A1','2:A2'] -> '1:A1|2:A2'
    //   SHA-1('1:A1|2:A2') = 1bb1ab4561b3ed094c44d5bf5e4c978e17feddd8
    const trips = buildRoundTrips([
      exec({ trade_id: '1', order_id: 'A1', symbol: 'SLE', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'SLE', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:31:00' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].exec_hash).toBe('1bb1ab4561b3ed094c44d5bf5e4c978e17feddd8')
  })

  it('multi-fill ODYS-shape trip (6 fills) with no account_name', () => {
    //   ids = ['1:A1','2:A2','3:A3','4:A4','5:A5','6:A6'] joined '|'
    //   SHA-1 = 8553626ddb6002f61ca6fa15359f22adec6e6ac7
    const trips = buildRoundTrips([
      exec({ trade_id: '1', order_id: 'A1', symbol: 'ODYS', side: 'B', qty: 500, price: 2.0, time: '2026-05-11T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'ODYS', side: 'S', qty: 100, price: 2.1, time: '2026-05-11T09:31:00' }),
      exec({ trade_id: '3', order_id: 'A3', symbol: 'ODYS', side: 'S', qty: 100, price: 2.15, time: '2026-05-11T09:32:00' }),
      exec({ trade_id: '4', order_id: 'A4', symbol: 'ODYS', side: 'S', qty: 100, price: 2.2, time: '2026-05-11T09:33:00' }),
      exec({ trade_id: '5', order_id: 'A5', symbol: 'ODYS', side: 'S', qty: 100, price: 2.25, time: '2026-05-11T09:34:00' }),
      exec({ trade_id: '6', order_id: 'A6', symbol: 'ODYS', side: 'S', qty: 100, price: 2.3, time: '2026-05-11T09:35:00' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].exec_hash).toBe('8553626ddb6002f61ca6fa15359f22adec6e6ac7')
  })

  it('account_name=ACCT_A diverges from no-account_name (multi-account partitioning)', () => {
    // Sanity check: account_name materially changes the hash. This is the
    // v0.2.0 multi-account guard — same fills under two different accounts
    // produce different exec_hashes so they don't dedup against each other.
    const baseExecs = [
      exec({ trade_id: '1', order_id: 'A1', symbol: 'X', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'X', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:31:00' }),
    ]
    const withAcct = baseExecs.map((e) => ({ ...e, account_name: 'ACCT_A' }))
    const noAcct = buildRoundTrips(baseExecs)
    const acctA = buildRoundTrips(withAcct)
    expect(acctA[0].exec_hash).not.toBe(noAcct[0].exec_hash)
  })
})

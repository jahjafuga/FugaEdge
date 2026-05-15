import { describe, expect, it } from 'vitest'
import { computeRoundTrips } from '../compute-trips'
import { buildRoundTrips } from '@/core/import/build-round-trips'
import type { Execution } from '@shared/import-types'

// The contract we're locking in: when account_name is unset (every v0.1.6
// trade ever imported), the universal builder's exec_hash equals the legacy
// builder's exec_hash for the same Execution[] input. This is what keeps
// existing users from seeing every trade re-flagged as "new" after the
// v0.2.0 upgrade.

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

describe('exec_hash compatibility — legacy computeRoundTrips vs buildRoundTrips', () => {
  it('matches when account_name is unset (v0.1.6 dedup preserved)', () => {
    const execs = [
      exec({ trade_id: '1', order_id: 'A1', symbol: 'SLE', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'SLE', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:31:00' }),
    ]
    const legacy = computeRoundTrips(execs)
    const universal = buildRoundTrips(execs)
    expect(legacy).toHaveLength(1)
    expect(universal).toHaveLength(1)
    expect(universal[0].exec_hash).toBe(legacy[0].exec_hash)
  })

  it('matches across a multi-fill trip (ODYS shape)', () => {
    const execs = [
      exec({ trade_id: '1', order_id: 'A1', symbol: 'ODYS', side: 'B', qty: 500, price: 2.0, time: '2026-05-11T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'ODYS', side: 'S', qty: 100, price: 2.1, time: '2026-05-11T09:31:00' }),
      exec({ trade_id: '3', order_id: 'A3', symbol: 'ODYS', side: 'S', qty: 100, price: 2.15, time: '2026-05-11T09:32:00' }),
      exec({ trade_id: '4', order_id: 'A4', symbol: 'ODYS', side: 'S', qty: 100, price: 2.2, time: '2026-05-11T09:33:00' }),
      exec({ trade_id: '5', order_id: 'A5', symbol: 'ODYS', side: 'S', qty: 100, price: 2.25, time: '2026-05-11T09:34:00' }),
      exec({ trade_id: '6', order_id: 'A6', symbol: 'ODYS', side: 'S', qty: 100, price: 2.3, time: '2026-05-11T09:35:00' }),
    ]
    const legacy = computeRoundTrips(execs)
    const universal = buildRoundTrips(execs)
    expect(universal[0].exec_hash).toBe(legacy[0].exec_hash)
  })

  it('differs when account_name is set (multi-account partitioning kicks in)', () => {
    const without: Execution[] = [
      exec({ trade_id: '1', order_id: 'A1', symbol: 'X', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ trade_id: '2', order_id: 'A2', symbol: 'X', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:31:00' }),
    ]
    const withAcct = without.map((e) => ({ ...e, account_name: 'ACCT_A' }))
    const u1 = buildRoundTrips(without)
    const u2 = buildRoundTrips(withAcct)
    expect(u1[0].exec_hash).not.toBe(u2[0].exec_hash)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { buildRoundTrips } from '../build-round-trips'
import type { Execution, SourceBroker, SourceFormat } from '@shared/import-types'

// Test-only Execution factory. Auto-assigns deterministic trade_id/order_id
// so hash assertions don't drift between test runs; reset in beforeEach so
// each `it()` starts from id=0.
let idCounter = 0
beforeEach(() => {
  idCounter = 0
})

interface ExecOverrides {
  symbol: string
  side: 'B' | 'S'
  qty: number
  price: number
  time: string
  trade_id?: string
  order_id?: string
  account_name?: string
  source_broker?: SourceBroker
  source_format?: SourceFormat
  source_file?: string
  commission?: number
  ecn_fee?: number
  sec_fee?: number
  finra_fee?: number
  cat_fee?: number
  htb_fee?: number
  other_fees?: number
}

function exec(o: ExecOverrides): Execution {
  idCounter += 1
  const id = String(idCounter)
  return {
    trade_id: o.trade_id ?? `T${id}`,
    order_id: o.order_id ?? `O${id}`,
    is_short: o.side === 'S',
    date: o.time.slice(0, 10),
    symbol: o.symbol,
    side: o.side,
    qty: o.qty,
    price: o.price,
    time: o.time,
    account_name: o.account_name,
    source_broker: o.source_broker,
    source_format: o.source_format,
    source_file: o.source_file,
    commission: o.commission,
    ecn_fee: o.ecn_fee,
    sec_fee: o.sec_fee,
    finra_fee: o.finra_fee,
    cat_fee: o.cat_fee,
    htb_fee: o.htb_fee,
    other_fees: o.other_fees,
  }
}

describe('buildRoundTrips — simple cases', () => {
  it('builds one long round trip from a single buy/sell pair', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'AAPL', side: 'B', qty: 100, price: 150.0, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'AAPL', side: 'S', qty: 100, price: 151.0, time: '2026-05-15T09:31:00' }),
    ])
    expect(trips).toHaveLength(1)
    const t = trips[0]
    expect(t.symbol).toBe('AAPL')
    expect(t.side).toBe('long')
    expect(t.shares_bought).toBe(100)
    expect(t.shares_sold).toBe(100)
    expect(t.avg_buy_price).toBe(150.0)
    expect(t.avg_sell_price).toBe(151.0)
    expect(t.gross_pnl).toBe(100)
    expect(t.net_pnl).toBe(100)
    expect(t.total_fees).toBe(0)
    expect(t.fees_reported).toBe(false)
    expect(t.is_open).toBe(false)
    expect(t.open_time).toBe('2026-05-15T09:30:00')
    expect(t.close_time).toBe('2026-05-15T09:31:00')
    expect(t.executions).toHaveLength(2)
  })

  it('builds a short round trip when the first leg is a sell', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'XYZ', side: 'S', qty: 100, price: 150, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'XYZ', side: 'B', qty: 100, price: 148, time: '2026-05-15T09:35:00' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('short')
    expect(trips[0].gross_pnl).toBe(200)
    expect(trips[0].is_open).toBe(false)
  })
})

describe('buildRoundTrips — real-data shapes', () => {
  it('handles ODYS-shape (1 buy + 5 partial sells)', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'ODYS', side: 'B', qty: 500, price: 2.0, time: '2026-05-11T09:30:00' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.1, time: '2026-05-11T09:31:00' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.15, time: '2026-05-11T09:32:00' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.2, time: '2026-05-11T09:33:00' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.25, time: '2026-05-11T09:34:00' }),
      exec({ symbol: 'ODYS', side: 'S', qty: 100, price: 2.3, time: '2026-05-11T09:35:00' }),
    ])
    expect(trips).toHaveLength(1)
    const t = trips[0]
    expect(t.shares_bought).toBe(500)
    expect(t.shares_sold).toBe(500)
    expect(t.avg_buy_price).toBe(2.0)
    expect(t.avg_sell_price).toBeCloseTo(2.2, 4) // (2.10+2.15+2.20+2.25+2.30)/5
    expect(t.gross_pnl).toBeCloseTo(100, 2) // (2.20-2.00) * 500
    expect(t.is_open).toBe(false)
    expect(t.executions).toHaveLength(6)
  })

  it('handles adds — multiple buys before sells, weighted-avg entry', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'GME', side: 'B', qty: 100, price: 10, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'GME', side: 'B', qty: 100, price: 12, time: '2026-05-15T09:31:00' }),
      exec({ symbol: 'GME', side: 'B', qty: 100, price: 11, time: '2026-05-15T09:32:00' }),
      exec({ symbol: 'GME', side: 'S', qty: 300, price: 13, time: '2026-05-15T09:33:00' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].avg_buy_price).toBe(11)
    expect(trips[0].avg_sell_price).toBe(13)
    expect(trips[0].gross_pnl).toBe(600)
  })

  it('emits two round trips when the same symbol cycles to flat twice', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'TSLA', side: 'B', qty: 100, price: 200, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'TSLA', side: 'S', qty: 100, price: 205, time: '2026-05-15T09:35:00' }),
      exec({ symbol: 'TSLA', side: 'B', qty: 100, price: 210, time: '2026-05-15T10:00:00' }),
      exec({ symbol: 'TSLA', side: 'S', qty: 100, price: 215, time: '2026-05-15T10:05:00' }),
    ])
    expect(trips).toHaveLength(2)
    expect(trips[0].gross_pnl).toBe(500)
    expect(trips[1].gross_pnl).toBe(500)
    // Sorted by open_time ascending
    expect(trips[0].open_time < trips[1].open_time).toBe(true)
  })

  it('partitions executions across symbols into independent trips', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'AAA', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'BBB', side: 'B', qty: 100, price: 7, time: '2026-05-15T09:31:00' }),
      exec({ symbol: 'AAA', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:32:00' }),
      exec({ symbol: 'BBB', side: 'S', qty: 100, price: 8, time: '2026-05-15T09:33:00' }),
    ])
    expect(trips).toHaveLength(2)
    const bySymbol = Object.fromEntries(trips.map((t) => [t.symbol, t]))
    expect(bySymbol.AAA.gross_pnl).toBe(100)
    expect(bySymbol.BBB.gross_pnl).toBe(100)
  })
})

describe('buildRoundTrips — open positions (decision E)', () => {
  it('emits an open trip when the position never returns to zero', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'NVDA', side: 'B', qty: 100, price: 500, time: '2026-05-15T09:30:00' }),
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].is_open).toBe(true)
    expect(trips[0].close_time).toBe(null)
    expect(trips[0].shares_bought).toBe(100)
    expect(trips[0].shares_sold).toBe(0)
  })

  it('emits one closed trip plus one open trip when the second cycle is incomplete', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'NVDA', side: 'B', qty: 100, price: 500, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'NVDA', side: 'S', qty: 100, price: 510, time: '2026-05-15T09:35:00' }),
      exec({ symbol: 'NVDA', side: 'B', qty: 100, price: 520, time: '2026-05-15T10:00:00' }),
    ])
    expect(trips).toHaveLength(2)
    expect(trips[0].is_open).toBe(false)
    expect(trips[1].is_open).toBe(true)
    expect(trips[1].close_time).toBe(null)
  })
})

describe('buildRoundTrips — fees', () => {
  it('preserves negative ECN fees (rebates) as negative contributions', () => {
    const trips = buildRoundTrips([
      exec({
        symbol: 'AMC', side: 'B', qty: 100, price: 5,
        time: '2026-05-15T09:30:00', ecn_fee: 0.15,
      }),
      exec({
        symbol: 'AMC', side: 'S', qty: 100, price: 6,
        time: '2026-05-15T09:35:00', ecn_fee: -0.3, // rebate
      }),
    ])
    expect(trips[0].total_fees).toBeCloseTo(-0.15, 2)
    expect(trips[0].fees_reported).toBe(true)
    // net_pnl = gross_pnl - total_fees. Gross = (6 - 5) * 100 = 100.
    // Negative total_fees increases net_pnl.
    expect(trips[0].net_pnl).toBeCloseTo(100.15, 2)
  })

  it('sets fees_reported=false when no per-execution fee field is populated', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'NIO', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({ symbol: 'NIO', side: 'S', qty: 100, price: 6, time: '2026-05-15T09:31:00' }),
    ])
    expect(trips[0].fees_reported).toBe(false)
    expect(trips[0].total_fees).toBe(0)
  })

  it('sets fees_reported=true even when only one execution carries fees', () => {
    const trips = buildRoundTrips([
      exec({ symbol: 'NIO', side: 'B', qty: 100, price: 5, time: '2026-05-15T09:30:00' }),
      exec({
        symbol: 'NIO', side: 'S', qty: 100, price: 6,
        time: '2026-05-15T09:31:00', sec_fee: 0.02,
      }),
    ])
    expect(trips[0].fees_reported).toBe(true)
    expect(trips[0].total_fees).toBeCloseTo(0.02, 2)
  })
})

describe('buildRoundTrips — provenance + grouping', () => {
  it('propagates source_broker / source_format / source_file from the first execution', () => {
    const trips = buildRoundTrips([
      exec({
        symbol: 'X', side: 'B', qty: 100, price: 5,
        time: '2026-05-15T09:30:00',
        source_broker: 'DAS', source_format: 'execution', source_file: 'trades.csv',
      }),
      exec({
        symbol: 'X', side: 'S', qty: 100, price: 6,
        time: '2026-05-15T09:31:00',
        source_broker: 'DAS', source_format: 'execution', source_file: 'trades.csv',
      }),
    ])
    expect(trips[0].source_broker).toBe('DAS')
    expect(trips[0].source_format).toBe('execution')
    expect(trips[0].source_file).toBe('trades.csv')
  })

  it('partitions trips by (symbol, account_name) when account_name is set (decision D)', () => {
    const trips = buildRoundTrips([
      exec({
        symbol: 'X', side: 'B', qty: 100, price: 5,
        time: '2026-05-15T09:30:00', account_name: 'ACCT_A',
      }),
      exec({
        symbol: 'X', side: 'S', qty: 100, price: 6,
        time: '2026-05-15T09:31:00', account_name: 'ACCT_A',
      }),
      exec({
        symbol: 'X', side: 'B', qty: 100, price: 7,
        time: '2026-05-15T09:32:00', account_name: 'ACCT_B',
      }),
      exec({
        symbol: 'X', side: 'S', qty: 100, price: 8,
        time: '2026-05-15T09:33:00', account_name: 'ACCT_B',
      }),
    ])
    expect(trips).toHaveLength(2)
    const byAccount = Object.fromEntries(
      trips.map((t) => [t.account_name ?? '<none>', t]),
    )
    expect(byAccount.ACCT_A.gross_pnl).toBe(100)
    expect(byAccount.ACCT_B.gross_pnl).toBe(100)
    expect(byAccount.ACCT_A.exec_hash).not.toBe(byAccount.ACCT_B.exec_hash)
  })

  it('hash collapses to v0.1.6 shape when account_name is unset (decision D — upgrade compat)', () => {
    const execs = [
      exec({
        trade_id: 'T1', order_id: 'O1',
        symbol: 'SLE', side: 'B', qty: 100, price: 5,
        time: '2026-05-15T09:30:00',
      }),
      exec({
        trade_id: 'T2', order_id: 'O2',
        symbol: 'SLE', side: 'S', qty: 100, price: 6,
        time: '2026-05-15T09:31:00',
      }),
    ]
    const trips = buildRoundTrips(execs)
    // hashFills sorts "trade_id:order_id" pairs and joins with '|', no acct
    // prefix when account_name is empty. The legacy compute-trips.ts hashTrip
    // implementation does literally the same thing — that's the contract.
    const expected = createHash('sha1').update('T1:O1|T2:O2').digest('hex')
    expect(trips[0].exec_hash).toBe(expected)
  })
})

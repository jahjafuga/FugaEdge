import { createHash } from 'node:crypto'
import type { Execution, RoundTrip, RoundTripExecution } from '@shared/import-types'

// Groups executions by symbol, sorts by time, and walks the cumulative net
// share position. Every time the position returns to 0 a round trip is
// closed. Any remaining position at the end becomes an "open" round trip
// (which the repo wipes-and-rewrites on every import — see repo.commitTrips).
export function computeRoundTrips(executions: Execution[]): RoundTrip[] {
  const bySymbol = new Map<string, Execution[]>()
  for (const e of executions) {
    const list = bySymbol.get(e.symbol)
    if (list) list.push(e)
    else bySymbol.set(e.symbol, [e])
  }

  const trips: RoundTrip[] = []

  for (const [, list] of bySymbol) {
    list.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))

    let position = 0
    let bucket: Execution[] = []

    for (const e of list) {
      bucket.push(e)
      position += e.side === 'B' ? e.qty : -e.qty
      if (position === 0) {
        trips.push(buildTrip(bucket, false))
        bucket = []
      }
    }

    if (bucket.length > 0) {
      trips.push(buildTrip(bucket, true))
    }
  }

  // Stable order: by open_time ascending so the UI shows the day chronologically.
  trips.sort((a, b) => (a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0))
  return trips
}

function buildTrip(execs: Execution[], isOpen: boolean): RoundTrip {
  let sharesBought = 0
  let sharesSold = 0
  let costBought = 0
  let proceedsSold = 0
  const fills: RoundTripExecution[] = []
  for (const e of execs) {
    if (e.side === 'B') {
      sharesBought += e.qty
      costBought += e.qty * e.price
    } else {
      sharesSold += e.qty
      proceedsSold += e.qty * e.price
    }
    fills.push({
      trade_id: e.trade_id,
      order_id: e.order_id,
      side: e.side,
      qty: e.qty,
      price: e.price,
      time: e.time,
    })
  }

  const first = execs[0]
  const last = execs[execs.length - 1]
  const side: 'long' | 'short' = first.side === 'B' ? 'long' : 'short'
  const grossPnl = round2(proceedsSold - costBought)
  const avgBuy = sharesBought > 0 ? round4(costBought / sharesBought) : 0
  const avgSell = sharesSold > 0 ? round4(proceedsSold / sharesSold) : 0

  return {
    date: first.date,
    symbol: first.symbol,
    side,
    open_time: first.time,
    close_time: isOpen ? null : last.time,
    is_open: isOpen,
    shares_bought: sharesBought,
    avg_buy_price: avgBuy,
    shares_sold: sharesSold,
    avg_sell_price: avgSell,
    gross_pnl: grossPnl,
    total_fees: 0,
    net_pnl: grossPnl, // no fees yet
    exec_hash: hashTrip(fills),
    executions: fills,
    status: 'new',
  }
}

function hashTrip(fills: RoundTripExecution[]): string {
  const ids = fills.map((f) => `${f.trade_id}:${f.order_id}`).sort().join('|')
  return createHash('sha1').update(ids).digest('hex')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

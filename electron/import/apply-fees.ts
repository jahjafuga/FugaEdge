import { openDatabase } from '../db/database'

// Allocates day_fees pro-rata across every trade for (date, symbol).
// Basis: shares_bought + shares_sold per trip / total of same across all trips.
// Fee types that aren't share-based (HTB, sometimes ECN) get the same basis —
// good enough until we wire per-fee-type rates. After fees are applied we
// recompute the affected dates' daily_summary so the dashboard reflects them.

interface TripShare {
  id: number
  total_shares: number
  gross_pnl: number
}

interface DayFees {
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function recomputeFeesForDateSymbol(date: string, symbol: string): void {
  const db = openDatabase()

  const trips = db
    .prepare(`
      SELECT id, (shares_bought + shares_sold) AS total_shares, gross_pnl
      FROM trades WHERE date = ? AND symbol = ?
    `)
    .all(date, symbol) as TripShare[]

  if (trips.length === 0) {
    // Nothing to update. day_fees stays parked for when trades arrive later.
    return
  }

  const fees = db
    .prepare(`
      SELECT fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat
      FROM day_fees WHERE date = ? AND symbol = ?
    `)
    .get(date, symbol) as DayFees | undefined

  const update = db.prepare(`
    UPDATE trades SET
      fee_ecn   = @fee_ecn,
      fee_sec   = @fee_sec,
      fee_finra = @fee_finra,
      fee_htb   = @fee_htb,
      fee_cat   = @fee_cat,
      total_fees = @total_fees,
      net_pnl    = gross_pnl - @total_fees,
      pnl        = gross_pnl - @total_fees
    WHERE id = @id
  `)

  if (!fees) {
    // No fee data for this (date, symbol) — clear any previously-applied fees.
    for (const t of trips) {
      update.run({
        id: t.id,
        fee_ecn: 0,
        fee_sec: 0,
        fee_finra: 0,
        fee_htb: 0,
        fee_cat: 0,
        total_fees: 0,
      })
    }
    return
  }

  const totalShares = trips.reduce((acc, t) => acc + t.total_shares, 0)
  if (totalShares === 0) return

  // Track running totals so we can fix the rounding residue on the last trip —
  // pro-rata + rounding to cents would otherwise leave the sum a penny off.
  let acc = { ecn: 0, sec: 0, finra: 0, htb: 0, cat: 0 }

  trips.forEach((t, i) => {
    const last = i === trips.length - 1
    const ratio = t.total_shares / totalShares
    let ecn = last ? round2(fees.fee_ecn - acc.ecn) : round2(fees.fee_ecn * ratio)
    let sec = last ? round2(fees.fee_sec - acc.sec) : round2(fees.fee_sec * ratio)
    let finra = last ? round2(fees.fee_finra - acc.finra) : round2(fees.fee_finra * ratio)
    let htb = last ? round2(fees.fee_htb - acc.htb) : round2(fees.fee_htb * ratio)
    let cat = last ? round2(fees.fee_cat - acc.cat) : round2(fees.fee_cat * ratio)
    if (ecn < 0) ecn = 0
    if (sec < 0) sec = 0
    if (finra < 0) finra = 0
    if (htb < 0) htb = 0
    if (cat < 0) cat = 0
    acc = {
      ecn: acc.ecn + ecn,
      sec: acc.sec + sec,
      finra: acc.finra + finra,
      htb: acc.htb + htb,
      cat: acc.cat + cat,
    }
    const total = round2(ecn + sec + finra + htb + cat)
    update.run({
      id: t.id,
      fee_ecn: ecn,
      fee_sec: sec,
      fee_finra: finra,
      fee_htb: htb,
      fee_cat: cat,
      total_fees: total,
    })
  })
}

// Convenience: replays the allocation for everything in day_fees. Use when
// trade structure changes (e.g. a new round trip appears) so existing fees
// get reapportioned.
export function recomputeFeesForDates(dates: string[]): void {
  const db = openDatabase()
  if (dates.length === 0) return
  const placeholders = dates.map(() => '?').join(',')
  const pairs = db
    .prepare(`
      SELECT DISTINCT date, symbol FROM trades WHERE date IN (${placeholders})
    `)
    .all(...dates) as { date: string; symbol: string }[]
  for (const { date, symbol } of pairs) {
    recomputeFeesForDateSymbol(date, symbol)
  }
}

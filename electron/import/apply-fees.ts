import { openDatabase } from '../db/database'
import {
  allocateFees,
  zeroAllocation,
  type DayFees,
  type TripShare,
} from '@/core/import/allocate-fees'

// Thin DB wrapper around the pure allocation engine in
// /src/core/import/allocate-fees.ts. Read the (date, symbol) bucket of
// trips and the matching day_fees row, hand them to the pure math, and
// write the allocations back. Recomputes the affected dates' daily_summary
// downstream so the dashboard reflects new fees.
//
// SIGN-PRESERVING — see allocate-fees.ts for the v0.1.6 ECN-rebate bug
// fix context. This wrapper carries no clamping of its own; whatever the
// pure function returns is what lands in trades.fee_*.

export function recomputeFeesForDateSymbol(date: string, symbol: string): void {
  const db = openDatabase()

  const trips = db
    .prepare(`
      SELECT id, (shares_bought + shares_sold) AS total_shares
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

  const allocations = fees ? allocateFees(trips, fees) : zeroAllocation(trips)
  for (const a of allocations) update.run(a)
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

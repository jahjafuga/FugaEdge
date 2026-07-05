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

// Multi-account Beat 2: the spread is ACCOUNT-SCOPED end to end — the trip
// pool, the day_fees lookup, and therefore every allocation write touch only
// the owning account's rows. Account A's fee file can never land on Account
// B's trades sharing the same (date, symbol).
export function recomputeFeesForDateSymbol(
  date: string,
  symbol: string,
  accountId: string,
): void {
  const db = openDatabase()

  const trips = db
    .prepare(`
      SELECT id, (shares_bought + shares_sold) AS total_shares
      FROM trades
      WHERE date = ? AND symbol = ? AND deleted_at IS NULL
        -- Authoritative-fee trips (Ocean One: fees_reported = 1) carry their own
        -- total_fees from insert and must NEVER enter the day_fees pro-rata pool.
        -- Excluding them here fixes beat-3a Mode 1 (no day_fees → they were zeroed)
        -- AND Mode 2 (collision → the DAS pool's share denominator now shrinks back
        -- to DAS-only, restoring the colliding DAS trade's split).
        AND fees_reported = 0
        AND account_id = ?
    `)
    .all(date, symbol, accountId) as TripShare[]

  if (trips.length === 0) {
    // Nothing to update. day_fees stays parked for when trades arrive later.
    return
  }

  const fees = db
    .prepare(`
      SELECT fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, fee_commission, fee_other
      FROM day_fees WHERE date = ? AND symbol = ? AND account_id = ?
    `)
    .get(date, symbol, accountId) as DayFees | undefined

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
  // Beat 2: the replay enumerates (date, symbol, account) TRIPLES so each
  // account's pool re-spreads independently.
  const triples = db
    .prepare(`
      SELECT DISTINCT date, symbol, account_id FROM trades WHERE date IN (${placeholders}) AND deleted_at IS NULL
    `)
    .all(...dates) as { date: string; symbol: string; account_id: string }[]
  for (const { date, symbol, account_id } of triples) {
    recomputeFeesForDateSymbol(date, symbol, account_id)
  }
}

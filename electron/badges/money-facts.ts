// Arc 3 Beat 1 — the walled money fact for the milestone ladder. BOTH WALLS
// BORN-IN:
//   (1) the SIM WALL: the read carries SIM_WALL exactly as the 4703a10
//       money-facts precedents (execution-facts, pnl-facts) — practice can
//       never mint gold; ruled-GLOBAL, no scope param, the wall is a
//       data-integrity fence;
//   (2) the XP FENCE: this module feeds mintEarnedBadges, which is
//       display-only by construction (mint.ts never calls insertXpEvents) —
//       a milestone badge awards ZERO XP; D19's throw in goals/engine.ts is
//       untouched.
// MIRRORS the pnl-facts idiom (per-date SUM, cumulated in JS); imports
// NOTHING from goals/ or electron/cash — the peak is a trades-ledger fact,
// not a balance fact.

import { openDatabase } from '../db/database'
import { SIM_WALL } from '../accounts/scope'

/** The PROFIT PEAK (Lao-locked, 2026-07-04): the high-water mark of running
 *  cumulative net P&L over non-sim, non-deleted trades, floored at zero —
 *  an all-loss book has peak 0. Earned at peak, never un-earned by
 *  drawdown. */
export function profitPeak(): number {
  const db = openDatabase()
  const rows = db
    .prepare(
      `SELECT date, SUM(net_pnl) AS net_pnl
         FROM trades
        WHERE deleted_at IS NULL AND ${SIM_WALL}
        GROUP BY date
        ORDER BY date`,
    )
    .all() as { date: string; net_pnl: number }[]

  let running = 0
  let peak = 0
  for (const r of rows) {
    running += r.net_pnl
    if (running > peak) peak = running
  }
  return peak
}

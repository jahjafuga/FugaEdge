// Arc 1 Beat 1 — WALLED trade-fact reading for execution badges. This is the
// ONLY place badge stats read the trades / daily_summary tables.
//
// SEPARATE from electron/xp/pnl-facts.ts ON PURPOSE: pnl-facts.ts is the single
// DOCUMENTED §A2 XP exception (P&L reading for the maxloss XP award). Badges are
// DISPLAY-ONLY (no XP), so these facts never touch XP and never fall under §A2 —
// reusing pnl-facts.ts would blur that "one exception" meaning. Keeping the read
// here contains all trade-fact access behind one wall and lets the pure earn-rule
// (src/core/badges/earned.ts) stay blind to what its numbers measure. Every
// function returns a PLAIN NUMBER; ledger-sourced stats (annotation, risk-
// respected) are assembled in mint.ts, not here.

import { openDatabase } from '../db/database'
import { SIM_WALL } from '../accounts/scope'
import { sqlIsWin } from '@/core/classify/outcome'
import { SCRATCH_EPSILON } from '@shared/trade-classification'

const LOW_FLOAT_MAX = 20_000_000

/** Profitable trading days — judged on the per-DATE SUM across accounts
 *  (daily_summary is keyed (date, account_id) since Beat 4; badges keep their
 *  GLOBAL combined-trading meaning by aggregating before judging green).
 *  Sim exclusion LANDED in the sim-unlock audit (fix beat 2, Lao ruling
 *  2026-07-02): outcome facts judge REAL money only — the sim wall fences
 *  every read in this file. These facts stay ruled-GLOBAL and never take a
 *  scope param; the wall is a data-integrity fence, not scope participation. */
export function countGreenDays(): number {
  const db = openDatabase()
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT date FROM daily_summary WHERE ${SIM_WALL} GROUP BY date HAVING SUM(total_pnl) > 0)`,
      )
      .get() as { n: number }
  ).n
}

/** Winning trades — non-deleted trades above the scratch epsilon (the canonical
 *  win definition, so near-zero scratches never count). */
export function countWinningTrades(): number {
  const db = openDatabase()
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM trades WHERE deleted_at IS NULL AND ${SIM_WALL} AND ${sqlIsWin()}`,
      )
      .get(SCRATCH_EPSILON) as { n: number }
  ).n
}

/** Trades on sub-threshold-float runners (default sub-20M) — the small-cap
 *  momentum tell. float_shares is populated on nearly all real trades. */
export function countLowFloatTrades(maxFloat: number = LOW_FLOAT_MAX): number {
  const db = openDatabase()
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM trades WHERE deleted_at IS NULL AND ${SIM_WALL} AND float_shares IS NOT NULL AND float_shares < ?`,
      )
      .get(maxFloat) as { n: number }
  ).n
}

/** Longest run of consecutive profitable days over the daily_summary calendar
 *  (ordered by date). A non-green day (total_pnl <= 0) breaks the run; only
 *  recorded trading days count (gaps aren't bridged). Mirrors the streak-walk of
 *  readDisciplineStreak / computeStreak. */
export function longestGreenStreak(): number {
  const db = openDatabase()
  // Per-date SUM across accounts (Beat 4 re-key) — the walk itself is
  // unchanged; the sim wall landed per the countGreenDays note above.
  const rows = db
    .prepare(
      `SELECT SUM(total_pnl) AS total_pnl FROM daily_summary WHERE ${SIM_WALL} GROUP BY date ORDER BY date ASC`,
    )
    .all() as { total_pnl: number }[]
  let run = 0
  let longest = 0
  for (const r of rows) {
    if (r.total_pnl > 0) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return longest
}

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
import { sqlIsWin } from '@/core/classify/outcome'
import { SCRATCH_EPSILON } from '@shared/trade-classification'

const LOW_FLOAT_MAX = 20_000_000

/** Profitable trading days — daily_summary rows with a net-positive total_pnl. */
export function countGreenDays(): number {
  const db = openDatabase()
  return (
    db.prepare('SELECT COUNT(*) AS n FROM daily_summary WHERE total_pnl > 0').get() as { n: number }
  ).n
}

/** Winning trades — non-deleted trades above the scratch epsilon (the canonical
 *  win definition, so near-zero scratches never count). */
export function countWinningTrades(): number {
  const db = openDatabase()
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM trades WHERE deleted_at IS NULL AND ${sqlIsWin()}`)
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
        'SELECT COUNT(*) AS n FROM trades WHERE deleted_at IS NULL AND float_shares IS NOT NULL AND float_shares < ?',
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
  const rows = db
    .prepare('SELECT total_pnl FROM daily_summary ORDER BY date ASC')
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

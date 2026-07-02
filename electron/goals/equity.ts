// v0.2.5 Phase B Session 5 (L26) — the goals module's ONE money-reading
// query: cumulative net P&L since a date, for EQUITY GOAL PROGRESS ONLY.
// This sits deliberately OUTSIDE the XP wall: it is not an XP emission site
// and can never become one — the only path to a goal_completed intent is
// awardGoalCompletion(goal), which THROWS on kind === 'equity' (D19).
//
// Sim exclusion LANDED account-based (sim-unlock audit fix beat 2, Lao
// ruling 2026-07-02): the sim wall fences this aggregate — equity progress
// judges REAL money only. This supersedes the old is_paper note: the app's
// practice model is sim ACCOUNTS, not per-execution paper flags. No scope
// param — goals stay ruled-GLOBAL; the wall is a data-integrity fence.

import { openDatabase } from '../db/database'
import { SIM_WALL } from '../accounts/scope'

export function cumulativeNetPnlSince(startDate: string): number {
  const db = openDatabase()
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(net_pnl), 0) AS pnl FROM trades WHERE deleted_at IS NULL AND ${SIM_WALL} AND date >= ?`,
    )
    .get(startDate) as { pnl: number }
  return row.pnl
}

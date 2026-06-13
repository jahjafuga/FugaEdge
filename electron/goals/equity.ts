// v0.2.5 Phase B Session 5 (L26) — the goals module's ONE money-reading
// query: cumulative net P&L since a date, for EQUITY GOAL PROGRESS ONLY.
// This sits deliberately OUTSIDE the XP wall: it is not an XP emission site
// and can never become one — the only path to a goal_completed intent is
// awardGoalCompletion(goal), which THROWS on kind === 'equity' (D19).
// v0.3.0 paper-audit surface: this aggregate must exclude is_paper = 1
// executions when paper imports unlock (recorded in the ideas file).

import { openDatabase } from '../db/database'

export function cumulativeNetPnlSince(startDate: string): number {
  const db = openDatabase()
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(net_pnl), 0) AS pnl FROM trades WHERE deleted_at IS NULL AND date >= ?',
    )
    .get(startDate) as { pnl: number }
  return row.pnl
}

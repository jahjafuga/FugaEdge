import { openDatabase } from '../db/database'
import { SCRATCH_EPSILON } from '@shared/trade-classification'
import { sqlIsWin, sqlIsLoss } from '@/core/classify/outcome'

// v0.2.3 Phase 2a — extracted from import/repo.ts so BOTH the import commit
// path AND the trade-lifecycle ops (lifecycle.ts) share one daily_summary
// recompute. The aggregate filters soft-deleted rows (deleted_at IS NULL) —
// a trade in the Trash must not contribute to the day's totals.
//
// Multi-account Beat 4 — daily_summary is keyed (date, account_id), so the
// old single-row ON CONFLICT(date) upsert is gone. Each affected date is
// REWRITTEN: delete the date's rows, then INSERT one row per account that
// traded it (GROUP BY account_id). Accounts are derived INTERNALLY from the
// trades themselves, so caller signatures stay unchanged. Delete-first IS the
// empty-date cleanup (the v0.2.3 load-bearing branch): a date with zero live
// trades inserts nothing and its stale rows are already gone — the dashboard
// (which reads daily_summary directly) stops showing P&L for it.
//
// This helper opens NO transaction of its own. openDatabase() returns a
// cached singleton connection (db/database.ts), and better-sqlite3 prepared
// statements bind to the connection that prepared them, so every statement
// here runs inside whatever db.transaction the caller has open.
const insertGrouped = `
  INSERT INTO daily_summary
    (date, account_id, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss)
  SELECT
    date,
    account_id,
    COALESCE(SUM(net_pnl), 0),
    COALESCE(SUM(total_fees), 0),
    COUNT(*),
    SUM(CASE WHEN ${sqlIsWin()} THEN 1 ELSE 0 END),
    SUM(CASE WHEN ${sqlIsLoss()} THEN 1 ELSE 0 END),
    COALESCE(SUM(gross_pnl), 0),
    COALESCE(MAX(net_pnl), 0),
    COALESCE(MIN(net_pnl), 0)
  FROM trades WHERE date = ? AND deleted_at IS NULL GROUP BY account_id
`

export function recomputeSummaryForDates(dates: Set<string>): void {
  const db = openDatabase()
  const removeDate = db.prepare('DELETE FROM daily_summary WHERE date = ?')
  const insert = db.prepare(insertGrouped)
  for (const d of dates) {
    removeDate.run(d)
    // Win/loss CASE `?` precede `WHERE date = ?`, so the epsilons bind first
    // (losers: negated epsilon, sqlIsLoss is `< ?`).
    insert.run(SCRATCH_EPSILON, -SCRATCH_EPSILON, d)
  }
}

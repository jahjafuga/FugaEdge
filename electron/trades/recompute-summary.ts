import { openDatabase } from '../db/database'

// v0.2.3 Phase 2a — extracted from import/repo.ts so BOTH the import commit
// path AND the trade-lifecycle ops (lifecycle.ts) share one daily_summary
// recompute. Two changes vs. the original inline loop:
//
//   1. The aggregate now filters soft-deleted rows (deleted_at IS NULL) — a
//      trade in the Trash must not contribute to the day's totals.
//   2. The empty-date branch (see below) deletes a stale daily_summary row
//      when a date drops to zero LIVE trades.
//
// Why the empty-date branch is load-bearing: the import path only ever ADDS
// live trades, so a date it touches always ends with >= 1 live trade and the
// upsert's SELECT never returns zero rows. Lifecycle soft/hard-delete is the
// first caller that can empty a date. With the bare upsert, an emptied date's
// SELECT returns no rows → nothing inserted → ON CONFLICT never fires → the
// pre-existing daily_summary row is left STALE. stats/dashboard.ts reads
// daily_summary DIRECTLY and unfiltered (equity curve, per-day card, month
// calendar), so a stale row would show P&L for a day with no live trades.
// Deleting the row makes the dashboard omit the date, matching what
// calendar/get.ts (which reads `trades` with the filter) already shows.
//
// This helper opens NO transaction of its own. openDatabase() returns a
// cached singleton connection (db/database.ts), and better-sqlite3 prepared
// statements bind to the connection that prepared them, so every statement
// here runs inside whatever db.transaction the caller has open.
const upsertSummary = `
  INSERT INTO daily_summary
    (date, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss)
  SELECT
    date,
    COALESCE(SUM(net_pnl), 0),
    COALESCE(SUM(total_fees), 0),
    COUNT(*),
    SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END),
    SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END),
    COALESCE(SUM(gross_pnl), 0),
    COALESCE(MAX(net_pnl), 0),
    COALESCE(MIN(net_pnl), 0)
  FROM trades WHERE date = ? AND deleted_at IS NULL GROUP BY date
  ON CONFLICT(date) DO UPDATE SET
    total_pnl    = excluded.total_pnl,
    total_fees   = excluded.total_fees,
    trade_count  = excluded.trade_count,
    winners      = excluded.winners,
    losers       = excluded.losers,
    gross_pnl    = excluded.gross_pnl,
    largest_win  = excluded.largest_win,
    largest_loss = excluded.largest_loss
`

export function recomputeSummaryForDates(dates: Set<string>): void {
  const db = openDatabase()
  const upsert = db.prepare(upsertSummary)
  const liveCount = db.prepare(
    'SELECT COUNT(*) AS n FROM trades WHERE date = ? AND deleted_at IS NULL',
  )
  const removeEmpty = db.prepare('DELETE FROM daily_summary WHERE date = ?')
  for (const d of dates) {
    const { n } = liveCount.get(d) as { n: number }
    if (n === 0) removeEmpty.run(d)
    else upsert.run(d)
  }
}

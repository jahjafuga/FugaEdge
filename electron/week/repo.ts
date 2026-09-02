import { openDatabase } from '../db/database'
import { listTradesInRange } from '../trades/list'
import { scopeFilter } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeExitDeltas } from '@/core/analytics/exit-quality'
import { computeRuleBreaks } from '@/core/analytics/ruleBreaks'
import { restrictMapsToWindow } from '@/core/analytics/periodRuleBreaks'
import { readRuleBreaksByDate } from '../ruleBreaks/repo'
import type { PeriodDetail, WeekDetail, WeekJournalEntry } from '@shared/week-types'

function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

/** ONE WINDOW OF THE BOOK. The four bounds-only reads getWeekDetail always
 *  did, with nothing week-shaped left in them.
 *
 *  WHAT MOVED HERE AND WHAT DID NOT. The repo had exactly two week-shaped
 *  lines: the six-day offset that derives a Saturday, and the week_notes
 *  lookup, which is keyed on a week id. Both stayed with the week. Everything
 *  below works on any pair of dates and always did.
 *
 *  THE STREAK MAP IS DELIBERATELY UNBOUNDED. It reads every traded date in the
 *  book so a streak can reach back before the window opens. That is why it
 *  takes no dates, and why widening the window changes nothing about it.
 *
 *  computeWeekMetrics is called with `to` as its weekEnd. Its only use of that
 *  parameter is an upper bound -- src/core/analytics/week.ts:302
 *
 *      .filter((d) => d <= weekEnd)
 *
 *  -- so it is period-agnostic already and is left exactly as it is. */
export function getPeriodDetail(
  from: string,
  to: string,
  opts?: { accountScope?: AccountScope },
): PeriodDetail {
  const db = openDatabase()
  const scope = opts?.accountScope ?? 'all'
  const trades = listTradesInRange(from, to, scope)

  // Scoped daily net P&L, whole-book, so the streak can reach back beyond the
  // window. Not filtered by from/to -- see the note above.
  const sf = scopeFilter(scope)
  const dailyRows = db
    .prepare(
      `SELECT date, SUM(net_pnl) AS pnl FROM trades WHERE deleted_at IS NULL AND ${sf.clause} GROUP BY date`,
    )
    .all(...sf.params) as { date: string; pnl: number }[]
  const dailyPnl = new Map<string, number>()
  for (const r of dailyRows) dailyPnl.set(r.date, r.pnl)

  // Per-day journal entry text inside the window. Only days with a journal row
  // appear; a window with none -> []. (journal has no deleted_at.)
  const journalRows = db
    .prepare(`
      SELECT date, premarket_notes, postsession_notes
      FROM journal
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `)
    .all(from, to) as {
    date: string
    premarket_notes: string | null
    postsession_notes: string | null
  }[]
  const entries: WeekJournalEntry[] = journalRows.map((r) => ({
    date: r.date,
    premarket_notes: r.premarket_notes ?? '',
    postsession_notes: r.postsession_notes ?? '',
  }))

  const metrics = computeWeekMetrics({ trades, weekEnd: to, dailyPnl, exitDeltas: computeExitDeltas(trades) })

  // THE RULE BREAKS INSIDE THIS WINDOW. One read, no WHERE clause and no
  // per-day loop: readRuleBreaksByDate returns the whole book in a single
  // query, so a month costs one round trip and not thirty. BOTH maps are
  // then cut to [from, to] -- the P&L one as well, because it is unbounded
  // on purpose above and every traded day in the book would otherwise count
  // as a clean day of this window. The boundary is INCLUSIVE at both ends.
  //
  // UNSCOPED, deliberately: a rule break is a property of a DAY, not of an
  // account -- journal_rule_break is keyed on (date, rule_break_def_id) and
  // carries no account column, so there is nothing to scope it by. The
  // daily P&L it is measured against IS scoped, exactly as the streak is.
  const windowed = restrictMapsToWindow(readRuleBreaksByDate(db), dailyPnl, from, to)
  const ruleBreaks = computeRuleBreaks(windowed.ruleBreaksByDate, windowed.netPnlByDate)

  return { from, to, metrics, trades, entries, ruleBreaks }
}

// v0.2.2 Day 4.5b -- Weekly Review detail assembly. weekStart is the Sunday
// the calendar grid row is anchored on; the week is [weekStart, weekStart+6]
// (Sun-Sat), filtered by trades.date (the Eastern trading day -- never
// open_time, so no TZ conversion at query time).
//
// THE WEEK IS ONE WINDOW PLUS ITS NOTE. The two week-shaped things live here
// and nowhere else: the offset that makes a Saturday, and the week_notes read.
// Everything else is getPeriodDetail's, and the output is byte-identical to
// what this function returned before the split.
export function getWeekDetail(
  weekStart: string,
  opts?: { accountScope?: AccountScope },
): WeekDetail {
  const weekEnd = addDaysStr(weekStart, 6)
  const period = getPeriodDetail(weekStart, weekEnd, opts)

  // Week metadata stays GLOBAL -- unscoped, exactly as before.
  const db = openDatabase()
  const notesRow = db
    .prepare('SELECT text FROM week_notes WHERE week_start = ?')
    .get(weekStart) as { text: string } | undefined

  return {
    weekStart,
    weekEnd,
    metrics: period.metrics,
    trades: period.trades,
    ruleBreaks: period.ruleBreaks,
    notes: notesRow?.text ?? '',
    entries: period.entries,
  }
}

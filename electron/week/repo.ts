import { openDatabase } from '../db/database'
import { listTradesInRange } from '../trades/list'
import { scopeFilter } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeExitDeltas } from '@/core/analytics/exit-quality'
import type { WeekDetail, WeekJournalEntry } from '@shared/week-types'

function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// v0.2.2 Day 4.5b — Weekly Review detail assembly. weekStart is the Sunday
// the calendar grid row is anchored on; the week is [weekStart, weekStart+6]
// (Sun–Sat), filtered by trades.date (the Eastern trading day — never
// open_time, so no TZ conversion at query time).
export function getWeekDetail(
  weekStart: string,
  opts?: { accountScope?: AccountScope },
): WeekDetail {
  const db = openDatabase()
  const weekEnd = addDaysStr(weekStart, 6)
  // Multi-account (Technicals slice, beat 2) — the trades AND the streak map
  // ride the same scope (this healed the split-brain where the trades rode
  // the wall while the map was legacy-unfiltered). The map feeds the
  // green/red-day P&L streak — NOT the showing-up identity streak, which is
  // GLOBAL and lives elsewhere. Week metadata (week_notes, journal) stays
  // global below.
  const scope = opts?.accountScope ?? 'all'
  const trades = listTradesInRange(weekStart, weekEnd, scope)

  // Scoped daily net P&L so the streak can reach back beyond this week.
  const sf = scopeFilter(scope)
  const dailyRows = db
    .prepare(
      `SELECT date, SUM(net_pnl) AS pnl FROM trades WHERE deleted_at IS NULL AND ${sf.clause} GROUP BY date`,
    )
    .all(...sf.params) as { date: string; pnl: number }[]
  const dailyPnl = new Map<string, number>()
  for (const r of dailyRows) dailyPnl.set(r.date, r.pnl)

  const notesRow = db
    .prepare('SELECT text FROM week_notes WHERE week_start = ?')
    .get(weekStart) as { text: string } | undefined

  // Phase 5 — the week's per-day journal entry text, for the weekly pattern
  // view. Mirrors the calendar/weekly.ts journal range-query. Only days with a
  // journal row appear; a week with none → []. (journal has no deleted_at.)
  const journalRows = db
    .prepare(`
      SELECT date, premarket_notes, postsession_notes
      FROM journal
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `)
    .all(weekStart, weekEnd) as {
    date: string
    premarket_notes: string | null
    postsession_notes: string | null
  }[]
  const entries: WeekJournalEntry[] = journalRows.map((r) => ({
    date: r.date,
    premarket_notes: r.premarket_notes ?? '',
    postsession_notes: r.postsession_notes ?? '',
  }))

  const metrics = computeWeekMetrics({ trades, weekEnd, dailyPnl, exitDeltas: computeExitDeltas(trades) })

  return {
    weekStart,
    weekEnd,
    metrics,
    trades,
    notes: notesRow?.text ?? '',
    entries,
  }
}

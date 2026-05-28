import { openDatabase } from '../db/database'
import { listTradesInRange } from '../trades/list'
import { computeWeekMetrics } from '@/core/analytics/week'
import type { WeekDetail } from '@shared/week-types'

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
export function getWeekDetail(weekStart: string): WeekDetail {
  const db = openDatabase()
  const weekEnd = addDaysStr(weekStart, 6)
  const trades = listTradesInRange(weekStart, weekEnd)

  // All-trades daily net P&L so the streak can reach back beyond this week.
  const dailyRows = db
    .prepare('SELECT date, SUM(net_pnl) AS pnl FROM trades GROUP BY date')
    .all() as { date: string; pnl: number }[]
  const dailyPnl = new Map<string, number>()
  for (const r of dailyRows) dailyPnl.set(r.date, r.pnl)

  const notesRow = db
    .prepare('SELECT text FROM week_notes WHERE week_start = ?')
    .get(weekStart) as { text: string } | undefined

  const metrics = computeWeekMetrics({ trades, weekEnd, dailyPnl })

  return {
    weekStart,
    weekEnd,
    metrics,
    trades,
    notes: notesRow?.text ?? '',
  }
}

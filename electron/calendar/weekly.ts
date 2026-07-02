import { openDatabase } from '../db/database'
import type { CalendarDay, WeeklySummary } from '@shared/calendar-types'
import type { AccountScope } from '@shared/accounts-types'
import { scopeFilter } from '../accounts/scope'
import { isWin, isLoss } from '@/core/classify/outcome'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The visible calendar grid is 6 rows × 7 days, Sun-aligned. This returns the
// 6 Sundays that anchor those rows for the given (year, month).
export function gridWeekStarts(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1)
  const lead = first.getDay() // 0 = Sun
  const firstSunday = new Date(year, month - 1, 1 - lead)
  const out: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(firstSunday)
    d.setDate(firstSunday.getDate() + i * 7)
    out.push(ymd(d))
  }
  return out
}

function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return ymd(dt)
}

interface TradeForWeek {
  date: string
  symbol: string
  net_pnl: number
  gross_pnl: number
  total_fees: number
}

interface JournalForWeek {
  date: string
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string
  rule_violations: string
}

function hasListContent(raw: string | null | undefined): boolean {
  if (!raw) return false
  const t = raw.trim()
  return t !== '' && t !== '[]'
}

function isNonEmptyJournal(j: JournalForWeek): boolean {
  return (
    j.premarket_notes.trim() !== '' ||
    j.postsession_notes.trim() !== '' ||
    j.emotion_rating != null ||
    hasListContent(j.rules_followed) ||
    hasListContent(j.rule_violations)
  )
}

// Walk backwards from week_end through daily P&L history. Returns the
// consecutive-day streak whose sign matches the most recent traded day.
function computeStreak(
  weekEnd: string,
  dailyPnl: Map<string, number>,
): { kind: 'win' | 'loss' | 'none'; days: number } {
  // All traded days <= weekEnd, sorted descending.
  const days = Array.from(dailyPnl.keys())
    .filter((d) => d <= weekEnd)
    .sort((a, b) => (a < b ? 1 : -1))
  if (days.length === 0) return { kind: 'none', days: 0 }
  const firstPnl = dailyPnl.get(days[0])!
  if (firstPnl === 0) return { kind: 'none', days: 0 }
  const kind: 'win' | 'loss' = firstPnl > 0 ? 'win' : 'loss'
  let count = 0
  for (const d of days) {
    const pnl = dailyPnl.get(d)!
    if (kind === 'win' ? pnl > 0 : pnl < 0) count++
    else break
  }
  return { kind, days: count }
}

function computeOne(
  weekStart: string,
  monthPrefix: string,
  trades: TradeForWeek[],
  journals: JournalForWeek[],
  notes: string,
  dailyPnl: Map<string, number>,
): WeeklySummary {
  const weekEnd = addDaysStr(weekStart, 6)
  const inMonth = (() => {
    for (let i = 0; i < 7; i++) {
      const d = addDaysStr(weekStart, i)
      if (d.slice(0, 7) === monthPrefix) return true
    }
    return false
  })()

  const inWeek = trades.filter((t) => t.date >= weekStart && t.date <= weekEnd)
  const winners = inWeek.filter((t) => isWin(t.net_pnl))
  const losers = inWeek.filter((t) => isLoss(t.net_pnl))

  let net = 0
  let gross = 0
  let fees = 0
  for (const t of inWeek) {
    net += t.net_pnl
    gross += t.gross_pnl
    fees += t.total_fees
  }

  const winnersSum = winners.reduce((s, t) => s + t.net_pnl, 0)
  const losersSum = losers.reduce((s, t) => s + t.net_pnl, 0)
  const decided = winners.length + losers.length

  // Per-day net P&L (only days falling inside this week).
  const dayMap = new Map<string, number>()
  for (const t of inWeek) {
    dayMap.set(t.date, (dayMap.get(t.date) ?? 0) + t.net_pnl)
  }
  let bestDay: { date: string; net_pnl: number } | null = null
  let worstDay: { date: string; net_pnl: number } | null = null
  for (const [d, pnl] of dayMap) {
    if (!bestDay || pnl > bestDay.net_pnl) bestDay = { date: d, net_pnl: pnl }
    if (!worstDay || pnl < worstDay.net_pnl) worstDay = { date: d, net_pnl: pnl }
  }

  // Per-symbol net P&L within the week.
  const symMap = new Map<string, number>()
  for (const t of inWeek) {
    symMap.set(t.symbol, (symMap.get(t.symbol) ?? 0) + t.net_pnl)
  }
  let bestSymbol: { symbol: string; net_pnl: number } | null = null
  for (const [s, pnl] of symMap) {
    if (!bestSymbol || pnl > bestSymbol.net_pnl) bestSymbol = { symbol: s, net_pnl: pnl }
  }

  // Discipline: days traded vs days journaled (limit to in-week).
  const daysTraded = dayMap.size
  const journalInWeek = journals.filter(
    (j) => j.date >= weekStart && j.date <= weekEnd,
  )
  const daysJournaled = journalInWeek.filter(isNonEmptyJournal).length

  // Emotion average over journals in this week that recorded one.
  const rated = journalInWeek.filter((j) => j.emotion_rating != null)
  const emotionAvg =
    rated.length > 0
      ? rated.reduce((s, j) => s + (j.emotion_rating ?? 0), 0) / rated.length
      : null

  const streak = computeStreak(weekEnd, dailyPnl)

  return {
    week_start: weekStart,
    week_end: weekEnd,
    in_month: inMonth,
    trade_count: inWeek.length,
    net_pnl: net,
    gross_pnl: gross,
    total_fees: fees,
    winners: winners.length,
    losers: losers.length,
    win_rate: decided > 0 ? winners.length / decided : null,
    profit_factor: losers.length > 0 ? winnersSum / Math.abs(losersSum) : null,
    avg_winner: winners.length > 0 ? winnersSum / winners.length : null,
    avg_loser: losers.length > 0 ? losersSum / losers.length : null,
    best_day: bestDay,
    worst_day: worstDay,
    best_symbol: bestSymbol,
    days_traded: daysTraded,
    days_journaled: daysJournaled,
    emotion_avg: emotionAvg,
    streak,
    notes,
  }
}

// Computes the 6 weekly summaries that align with the visible grid for the
// given month. Pulls trades + journals only once for the full range
// (preceding partial week + month + trailing partial week) and walks each
// row inline. Daily-P&L map across ALL trades is used for the streak so it
// can reach back beyond the visible window.
export function getWeeklySummaries(
  year: number,
  month: number,
  scope: AccountScope = 'all',
): WeeklySummary[] {
  const db = openDatabase()
  const monthPrefix = `${year}-${pad(month)}`
  const weekStarts = gridWeekStarts(year, month)
  const rangeStart = weekStarts[0]
  const rangeEnd = addDaysStr(weekStarts[weekStarts.length - 1], 6)

  // Multi-account slice — the P&L inputs (trades + the streak's daily map)
  // scope; journals + week notes are day/week metadata with no account
  // dimension and stay global.
  const sf = scopeFilter(scope)
  const trades = db
    .prepare(`
      SELECT date, symbol, net_pnl, gross_pnl, total_fees
      FROM trades
      WHERE date >= ? AND date <= ? AND deleted_at IS NULL AND ${sf.clause}
    `)
    .all(rangeStart, rangeEnd, ...sf.params) as TradeForWeek[]

  const journals = db
    .prepare(`
      SELECT date, premarket_notes, postsession_notes, emotion_rating,
             rules_followed, rule_violations
      FROM journal
      WHERE date >= ? AND date <= ?
    `)
    .all(rangeStart, rangeEnd) as JournalForWeek[]

  const notesRows = db
    .prepare(`
      SELECT week_start, text
      FROM week_notes
      WHERE week_start IN (${weekStarts.map(() => '?').join(',')})
    `)
    .all(...weekStarts) as { week_start: string; text: string }[]
  const notesMap = new Map(notesRows.map((r) => [r.week_start, r.text]))

  // For the streak we need access to every traded day's net P&L, including
  // dates outside the visible range (so a streak that started weeks ago is
  // counted correctly). Cheap aggregation in one shot.
  const dailyRows = db
    .prepare(
      `SELECT date, SUM(net_pnl) AS pnl FROM trades WHERE deleted_at IS NULL AND ${sf.clause} GROUP BY date`,
    )
    .all(...sf.params) as { date: string; pnl: number }[]
  const dailyPnl = new Map<string, number>()
  for (const r of dailyRows) dailyPnl.set(r.date, r.pnl)

  return weekStarts.map((ws) =>
    computeOne(ws, monthPrefix, trades, journals, notesMap.get(ws) ?? '', dailyPnl),
  )
}

// Re-exported here so the route layer can also fetch a single week's trade
// list for the weekly-review modal.
export function listTradesForWeek(
  weekStart: string,
  scope: AccountScope = 'all',
): CalendarDay['date'][] {
  // Just returns the dates the trades fall on; the renderer already has a
  // listTrades({ date }) IPC that can be called per-day for the modal.
  // (Kept simple to avoid duplicating the round-trip schema here.)
  const db = openDatabase()
  const end = addDaysStr(weekStart, 6)
  const sf = scopeFilter(scope)
  const rows = db
    .prepare(`
      SELECT DISTINCT date FROM trades
      WHERE date >= ? AND date <= ? AND deleted_at IS NULL AND ${sf.clause}
      ORDER BY date ASC
    `)
    .all(weekStart, end, ...sf.params) as { date: string }[]
  return rows.map((r) => r.date)
}

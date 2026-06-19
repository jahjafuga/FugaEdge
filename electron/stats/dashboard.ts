import { openDatabase } from '../db/database'
import { SCRATCH_EPSILON } from '@shared/trade-classification'
import { sqlIsWin, sqlIsLoss, sqlIsScratch } from '@/core/classify/outcome'
import { summarizeSession } from '@/core/analytics/summarizeSession'
import type {
  DailyPnlPoint,
  DashboardData,
  DashboardSettings,
  LatestSession,
  MonthCalendar,
  OverviewStats,
  SessionTrade,
  TimeRange,
} from '@shared/dashboard-types'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function ym(date: Date): { year: number; month: number; prefix: string } {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return { year, month, prefix: `${year}-${pad(month)}` }
}

// Converts '7d' / '30d' / etc. into an inclusive lower-bound date string.
// 'all' returns null (no filter).
function rangeStart(range: TimeRange, now: Date): string | null {
  if (range === 'all') return null
  const days = Number.parseInt(range, 10)
  if (!Number.isFinite(days) || days <= 0) return null
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readOverview(
  db: ReturnType<typeof openDatabase>,
  start: string | null,
): OverviewStats {
  const where = start ? 'WHERE deleted_at IS NULL AND date >= ?' : 'WHERE deleted_at IS NULL'
  const params = start ? [start] : []

  const totals = db
    .prepare(`
      SELECT
        COALESCE(SUM(net_pnl), 0)    AS net_pnl,
        COALESCE(SUM(gross_pnl), 0)  AS gross_pnl,
        COALESCE(SUM(total_fees), 0) AS total_fees,
        COUNT(*)                      AS trade_count,
        COALESCE(SUM(CASE WHEN ${sqlIsScratch()} THEN 1 ELSE 0 END), 0) AS scratches
      FROM trades ${where}
    `)
    // The scratch CASE's `?` appears before the optional `date >= ?` in `where`,
    // so SCRATCH_EPSILON binds first.
    .get(SCRATCH_EPSILON, ...params) as {
      net_pnl: number; gross_pnl: number; total_fees: number; trade_count: number; scratches: number
    }

  // The threshold `?` (sqlIsWin/sqlIsLoss) appears before the optional
  // `date >= ?`, so the epsilon binds first in each .get() below. Losers bind
  // the NEGATED epsilon (sqlIsLoss is `net_pnl < ?`).
  const winnersWhere = start
    ? `WHERE deleted_at IS NULL AND ${sqlIsWin()} AND date >= ?`
    : `WHERE deleted_at IS NULL AND ${sqlIsWin()}`
  const losersWhere = start
    ? `WHERE deleted_at IS NULL AND ${sqlIsLoss()} AND date >= ?`
    : `WHERE deleted_at IS NULL AND ${sqlIsLoss()}`

  const winners = db
    .prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(net_pnl), 0) AS sum, MAX(net_pnl) AS max
      FROM trades ${winnersWhere}
    `)
    .get(SCRATCH_EPSILON, ...params) as { n: number; sum: number; max: number | null }

  const losers = db
    .prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(net_pnl), 0) AS sum, MIN(net_pnl) AS min
      FROM trades ${losersWhere}
    `)
    .get(-SCRATCH_EPSILON, ...params) as { n: number; sum: number; min: number | null }

  const decided = winners.n + losers.n
  const win_rate = decided > 0 ? winners.n / decided : null
  const profit_factor =
    losers.n > 0 ? winners.sum / Math.abs(losers.sum) : null
  const avg_winner = winners.n > 0 ? winners.sum / winners.n : null
  const avg_loser = losers.n > 0 ? losers.sum / losers.n : null
  // P&L Ratio — avg win ÷ |avg loss| (distinct from profit factor). No losers →
  // Infinity; no winners → 0; no decided → null. Mirrors src/core day/week.
  const pnl_ratio =
    decided === 0 ? null : avg_loser === null ? Infinity : (avg_winner ?? 0) / Math.abs(avg_loser)
  const largest_winner = winners.n > 0 ? (winners.max ?? null) : null
  const largest_loser = losers.n > 0 ? (losers.min ?? null) : null

  return {
    net_pnl: totals.net_pnl,
    gross_pnl: totals.gross_pnl,
    total_fees: totals.total_fees,
    trade_count: totals.trade_count,
    winners: winners.n,
    losers: losers.n,
    scratches: totals.scratches,
    win_rate,
    profit_factor,
    pnl_ratio,
    avg_winner,
    avg_loser,
    largest_winner,
    largest_loser,
  }
}

interface DailyRowDb {
  date: string
  net_pnl: number
  trade_count: number
}

function readDailySeries(
  db: ReturnType<typeof openDatabase>,
  start: string | null,
): DailyPnlPoint[] {
  const rows = (
    start
      ? db
          .prepare(`
            SELECT date, total_pnl AS net_pnl, trade_count
            FROM daily_summary
            WHERE date >= ?
            ORDER BY date ASC
          `)
          .all(start)
      : db
          .prepare(`
            SELECT date, total_pnl AS net_pnl, trade_count
            FROM daily_summary
            ORDER BY date ASC
          `)
          .all()
  ) as DailyRowDb[]

  return rows.map((r) => ({
    date: r.date,
    net_pnl: r.net_pnl,
    trade_count: r.trade_count,
    avg_trade_pnl: r.trade_count > 0 ? r.net_pnl / r.trade_count : 0,
  }))
}

function readLatestSession(db: ReturnType<typeof openDatabase>): LatestSession {
  const row = db
    .prepare('SELECT MAX(date) AS date FROM trades WHERE deleted_at IS NULL')
    .get() as { date: string | null }
  const date = row?.date ?? ''
  if (!date) {
    return {
      date: '',
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 0,
      winners: 0,
      losers: 0,
      trades: [],
    }
  }
  // v0.1.5: include playbook tier so the dashboard's latest-session table
  // can show the tier badge inline with the playbook name. Cast to a
  // strict shape and coerce the tier text to the union — anything outside
  // the known set drops to null rather than poisoning the typed payload.
  interface SessionTradeDb extends Omit<SessionTrade, 'playbook_tier'> {
    playbook_tier: string | null
    // Projected for summarizeSession (Fix 2a) — sums the STORED gross_pnl so the
    // session gross matches daily_summary's. Not part of SessionTrade, so it
    // rides in the raw row only and is never read renderer-side.
    gross_pnl: number
  }
  const VALID_TIERS = new Set(['A+', 'A', 'B', 'C'])
  const rawTrades = db
    .prepare(`
      SELECT t.id, t.symbol, t.side, t.shares_bought, t.avg_buy_price,
             t.shares_sold, t.avg_sell_price, t.total_fees, t.net_pnl, t.gross_pnl,
             p.name AS playbook_name,
             CASE WHEN p.is_system = 1 THEN NULL ELSE p.tier END AS playbook_tier,
             t.confidence
      FROM trades t
      LEFT JOIN playbooks p ON p.id = t.playbook_id
      WHERE t.date = ? AND t.deleted_at IS NULL ORDER BY t.net_pnl DESC
    `)
    .all(date) as SessionTradeDb[]
  const trades: SessionTrade[] = rawTrades.map((r) => ({
    ...r,
    playbook_tier: r.playbook_tier && VALID_TIERS.has(r.playbook_tier)
      ? (r.playbook_tier as SessionTrade['playbook_tier'])
      : null,
  }))
  // Fix 2(a): source the session summary from the trades we ALREADY loaded —
  // NOT the daily_summary cache. data.latest.net_pnl (the Daily Goal + the
  // latest-session header) now matches the trade rows shown, even when the cache
  // is stale or absent. The equity curve + month calendar still read
  // daily_summary (readDailySeries / readMonth) — that cache stays as-is.
  const summary = summarizeSession(rawTrades)
  return {
    date,
    net_pnl: summary.net_pnl,
    gross_pnl: summary.gross_pnl,
    total_fees: summary.total_fees,
    trade_count: trades.length,
    winners: summary.winners,
    losers: summary.losers,
    trades,
  }
}

function readMonth(
  db: ReturnType<typeof openDatabase>,
  year: number,
  month: number,
): MonthCalendar {
  const prefix = `${year}-${pad(month)}`
  const rows = db
    .prepare(`
      SELECT date, total_pnl AS net_pnl, trade_count
      FROM daily_summary
      WHERE date LIKE ?
      ORDER BY date ASC
    `)
    .all(`${prefix}-%`) as DailyRowDb[]
  const days: DailyPnlPoint[] = rows.map((r) => ({
    date: r.date,
    net_pnl: r.net_pnl,
    trade_count: r.trade_count,
    avg_trade_pnl: r.trade_count > 0 ? r.net_pnl / r.trade_count : 0,
  }))
  return { year, month, days }
}

// Consecutive market days (Mon–Fri) up to and including the most recent
// reference date where the user either traded or wrote a journal entry.
//
// Walks backwards day-by-day from `now`. Weekends are skipped (markets
// closed) — they don't extend the streak but also don't break it. The first
// market day with neither trade nor journal content breaks the chain.
function readDisciplineStreak(
  db: ReturnType<typeof openDatabase>,
  now: Date,
): number {
  const tradedDays = new Set(
    (db.prepare('SELECT DISTINCT date FROM trades WHERE deleted_at IS NULL').all() as { date: string }[])
      .map((r) => r.date),
  )
  const journalDays = new Set(
    (
      db
        .prepare(`
          SELECT date FROM journal
          WHERE (premarket_notes IS NOT NULL AND TRIM(premarket_notes) != '')
             OR (postsession_notes IS NOT NULL AND TRIM(postsession_notes) != '')
             OR emotion_rating IS NOT NULL
             OR (rules_followed IS NOT NULL AND rules_followed != '' AND rules_followed != '[]')
             OR (rule_violations IS NOT NULL AND rule_violations != '' AND rule_violations != '[]')
             OR (day_tags IS NOT NULL AND day_tags != '' AND day_tags != '[]')
        `)
        .all() as { date: string }[]
    ).map((r) => r.date),
  )
  if (tradedDays.size === 0 && journalDays.size === 0) return 0

  const showedUp = (d: string) => tradedDays.has(d) || journalDays.has(d)
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const isMarketDay = (d: Date) => {
    const dow = d.getDay()
    return dow >= 1 && dow <= 5
  }

  // If today hasn't happened yet (no trades, no journal), don't break the
  // streak — start counting from the most recent market day that DID get
  // activity. This avoids the "I haven't logged premarket today, my 12-day
  // streak just zeroed" footgun.
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  while (isMarketDay(cursor) && !showedUp(ymd(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (cursor.getFullYear() < 1990) return 0 // safety bound
  }

  let streak = 0
  while (true) {
    if (isMarketDay(cursor)) {
      if (showedUp(ymd(cursor))) {
        streak++
      } else {
        break
      }
    }
    cursor.setDate(cursor.getDate() - 1)
    if (cursor.getFullYear() < 1990) break // safety bound
  }
  return streak
}

function readSettings(db: ReturnType<typeof openDatabase>): DashboardSettings {
  const rows = db
    .prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?)')
    .all('max_daily_loss', 'account_size', 'daily_profit_target') as { key: string; value: string }[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return {
    max_daily_loss: Number.parseFloat(map.max_daily_loss ?? '500') || 0,
    daily_profit_target: Number.parseFloat(map.daily_profit_target ?? '0') || 0,
    account_size: Number.parseFloat(map.account_size ?? '25000') || 0,
  }
}

export function getDashboardData(
  range: TimeRange = '30d',
  now: Date = new Date(),
): DashboardData {
  const db = openDatabase()
  const start = rangeStart(range, now)

  // `empty` reflects whether the user has ANY trades — not whether the
  // current range happens to be empty. Otherwise switching to 7d on a fresh
  // install would show the "Go import" CTA instead of the no-data state for
  // the chosen range.
  const totalRows = db.prepare('SELECT COUNT(*) AS n FROM trades WHERE deleted_at IS NULL').get() as {
    n: number
  }
  const empty = totalRows.n === 0

  const overview = readOverview(db, start)
  const daily = readDailySeries(db, start)
  const latest = readLatestSession(db)
  const target = latest.date ? new Date(`${latest.date}T00:00:00`) : now
  const { year, month } = ym(target)
  const monthData = readMonth(db, year, month)
  const settings = readSettings(db)
  const discipline_streak = readDisciplineStreak(db, now)

  return {
    range,
    range_start: start,
    overview,
    daily,
    latest,
    month: monthData,
    settings,
    discipline_streak,
    empty,
  }
}

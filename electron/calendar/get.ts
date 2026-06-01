import { openDatabase } from '../db/database'
import type {
  CalendarDay,
  CalendarMonth,
  CalendarMonthStats,
  CalendarRange,
} from '@shared/calendar-types'
import { getWeeklySummaries } from './weekly'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean)
  } catch {
    // fall through
  }
  return []
}

function readRange(db: ReturnType<typeof openDatabase>): CalendarRange {
  const bounds = db
    .prepare('SELECT MIN(date) AS earliest, MAX(date) AS latest FROM trades WHERE deleted_at IS NULL')
    .get() as { earliest: string | null; latest: string | null }

  const months = db
    .prepare(
      "SELECT DISTINCT substr(date, 1, 7) AS m FROM trades WHERE deleted_at IS NULL ORDER BY m ASC",
    )
    .all() as { m: string }[]

  return {
    earliest: bounds.earliest ?? null,
    latest: bounds.latest ?? null,
    monthsWithTrades: months.map((r) => r.m),
  }
}

interface DayRowDb {
  date: string
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  day_tags: string | null
  has_journal: number
  no_trade_day: number
  sentiment: number | null
}

function readMonthDays(
  db: ReturnType<typeof openDatabase>,
  year: number,
  month: number,
): CalendarDay[] {
  const like = `${year}-${pad(month)}-%`
  // UNION dates from trades AND journal-with-tags, then LEFT JOIN both back
  // so no-trade days that have tags (FOMC, Earnings, etc.) still appear.
  const rows = db
    .prepare(`
      WITH tr AS (
        SELECT
          date,
          SUM(net_pnl)    AS net_pnl,
          SUM(gross_pnl)  AS gross_pnl,
          SUM(total_fees) AS total_fees,
          COUNT(*)        AS trade_count,
          SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) AS winners,
          SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) AS losers
        FROM trades
        WHERE date LIKE ? AND deleted_at IS NULL
        GROUP BY date
      ),
      jr AS (
        -- Every journal row this month, with a hasContent flag that's 1 when
        -- ANY journal field is filled in (premarket/postsession/emotion/
        -- rules-followed/rule-violations/day-tags). Used both to source
        -- day_tags and to drive the pencil-icon affordance for sit-out days.
        SELECT
          date,
          day_tags,
          CASE WHEN
            (premarket_notes IS NOT NULL AND TRIM(premarket_notes) != '')
            OR (postsession_notes IS NOT NULL AND TRIM(postsession_notes) != '')
            OR (emotion_rating IS NOT NULL)
            OR (rules_followed IS NOT NULL AND rules_followed != '' AND rules_followed != '[]')
            OR (rule_violations IS NOT NULL AND rule_violations != '' AND rule_violations != '[]')
            OR (day_tags IS NOT NULL AND day_tags != '' AND day_tags != '[]')
          THEN 1 ELSE 0 END AS has_content
        FROM journal
        WHERE date LIKE ?
      ),
      jt AS (
        SELECT date, day_tags FROM jr
        WHERE day_tags IS NOT NULL AND day_tags != '[]' AND day_tags != ''
      ),
      sm AS (
        SELECT date, sentiment, no_trade_day FROM session_meta WHERE date LIKE ?
      ),
      all_dates AS (
        SELECT date FROM tr
        UNION SELECT date FROM jt
        UNION SELECT date FROM jr WHERE has_content = 1
        UNION SELECT date FROM sm WHERE sentiment IS NOT NULL
        -- A no-trade day marked only via session_meta (the dashboard
        -- button) won't show up in the other CTEs. Pull it in directly so
        -- the calendar marker + counter both see it.
        UNION SELECT date FROM sm WHERE no_trade_day = 1
      )
      SELECT
        d.date                                   AS date,
        COALESCE(tr.net_pnl, 0)                  AS net_pnl,
        COALESCE(tr.gross_pnl, 0)                AS gross_pnl,
        COALESCE(tr.total_fees, 0)               AS total_fees,
        COALESCE(tr.trade_count, 0)              AS trade_count,
        COALESCE(tr.winners, 0)                  AS winners,
        COALESCE(tr.losers, 0)                   AS losers,
        jt.day_tags                              AS day_tags,
        COALESCE(jr.has_content, 0)              AS has_journal,
        -- Unified no-trade flag: either UI path counts. day_tags is a JSON
        -- array TEXT, so a LIKE check on the literal needle is the cheapest
        -- way to detect the marker without a sqlite JSON1 dependency.
        CASE WHEN
          (sm.no_trade_day = 1)
          OR (jt.day_tags IS NOT NULL AND jt.day_tags LIKE '%"no-trade-day"%')
        THEN 1 ELSE 0 END                        AS no_trade_day,
        sm.sentiment                             AS sentiment
      FROM all_dates d
      LEFT JOIN tr ON tr.date = d.date
      LEFT JOIN jt ON jt.date = d.date
      LEFT JOIN jr ON jr.date = d.date
      LEFT JOIN sm ON sm.date = d.date
      ORDER BY d.date ASC
    `)
    .all(like, like, like) as DayRowDb[]

  return rows.map((r) => ({
    date: r.date,
    net_pnl: r.net_pnl,
    gross_pnl: r.gross_pnl,
    total_fees: r.total_fees,
    trade_count: r.trade_count,
    winners: r.winners,
    losers: r.losers,
    day_tags: parseTags(r.day_tags),
    has_journal: !!r.has_journal,
    no_trade_day: !!r.no_trade_day,
    sentiment: r.sentiment,
  }))
}

function summarize(
  year: number,
  month: number,
  days: CalendarDay[],
): CalendarMonthStats {
  let net = 0
  let gross = 0
  let fees = 0
  let trades = 0
  let winners = 0
  let losers = 0
  let trading_days = 0
  for (const d of days) {
    net += d.net_pnl
    gross += d.gross_pnl
    fees += d.total_fees
    trades += d.trade_count
    winners += d.winners
    losers += d.losers
    if (d.trade_count > 0) trading_days++
  }
  return {
    year,
    month,
    net_pnl: net,
    gross_pnl: gross,
    total_fees: fees,
    trade_count: trades,
    winners,
    losers,
    trading_days,
  }
}

export function getCalendarMonth(year: number, month: number): CalendarMonth {
  const db = openDatabase()
  const days = readMonthDays(db, year, month)
  return {
    stats: summarize(year, month, days),
    days,
    range: readRange(db),
    weeks: getWeeklySummaries(year, month),
  }
}

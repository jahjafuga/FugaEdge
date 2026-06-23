import { openDatabase } from '../db/database'
import { SCRATCH_EPSILON } from '@shared/trade-classification'
import { sqlIsWin, sqlIsLoss } from '@/core/classify/outcome'
import type {
  CalendarDay,
  CalendarMonth,
  CalendarMonthStats,
  CalendarRange,
  CalendarYear,
  CalendarYearMonth,
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
  avg_winner: number | null
  avg_loser: number | null
  day_tags: string | null
  has_journal: number
  no_trade_day: number
  is_holiday: number
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
          SUM(CASE WHEN ${sqlIsWin()} THEN 1 ELSE 0 END) AS winners,
          SUM(CASE WHEN ${sqlIsLoss()} THEN 1 ELSE 0 END) AS losers,
          -- Per-day avg winner / avg loser over net_pnl, split by the SAME
          -- win/loss predicates as the counts above. AVG ignores the NULLs the
          -- no-ELSE CASE produces, so each averages ONLY its side; no winners
          -- (or no losers) -> NULL, surfaced honestly (never 0). The cell
          -- derives P/L ratio = avg_winner / |avg_loser|, matching winLossRatio
          -- in src/core/performance/metrics.ts.
          AVG(CASE WHEN ${sqlIsWin()} THEN net_pnl END)  AS avg_winner,
          AVG(CASE WHEN ${sqlIsLoss()} THEN net_pnl END) AS avg_loser
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
          postsession_notes,
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
        tr.avg_winner                            AS avg_winner,
        tr.avg_loser                             AS avg_loser,
        jt.day_tags                              AS day_tags,
        COALESCE(jr.has_content, 0)              AS has_journal,
        -- Unified no-trade flag: either UI path counts. day_tags is a JSON
        -- array TEXT, so a LIKE check on the literal needle is the cheapest
        -- way to detect the marker without a sqlite JSON1 dependency.
        CASE WHEN
          (sm.no_trade_day = 1)
          OR (jt.day_tags IS NOT NULL AND jt.day_tags LIKE '%"no-trade-day"%')
        THEN 1 ELSE 0 END                        AS no_trade_day,
        -- Holiday sit-out: the sit-out modal stores
        -- "Sat out: Holiday (Market Closed)" in postsession_notes, so a LIKE on
        -- that literal label flags the day as a market holiday. The calendar
        -- cell reads this to render the closed sign (only where no_trade_day is
        -- already set), so a stray note that merely mentions the phrase never
        -- shows the marker on a normal trading day.
        CASE WHEN jr.postsession_notes LIKE '%Holiday (Market Closed)%'
          THEN 1 ELSE 0 END AS is_holiday,
        sm.sentiment                             AS sentiment
      FROM all_dates d
      LEFT JOIN tr ON tr.date = d.date
      LEFT JOIN jt ON jt.date = d.date
      LEFT JOIN jr ON jr.date = d.date
      LEFT JOIN sm ON sm.date = d.date
      ORDER BY d.date ASC
    `)
    // tr CTE's FOUR win/loss CASE `?` (winners + losers counts, then avg_winner
    // + avg_loser) precede all three `date LIKE ?`, so the epsilons lead in that
    // order: +eps (win count), -eps (loss count), +eps (avg win), -eps (avg loss).
    .all(SCRATCH_EPSILON, -SCRATCH_EPSILON, SCRATCH_EPSILON, -SCRATCH_EPSILON, like, like, like) as DayRowDb[]

  return rows.map((r) => ({
    date: r.date,
    net_pnl: r.net_pnl,
    gross_pnl: r.gross_pnl,
    total_fees: r.total_fees,
    trade_count: r.trade_count,
    winners: r.winners,
    losers: r.losers,
    avg_winner: r.avg_winner,
    avg_loser: r.avg_loser,
    day_tags: parseTags(r.day_tags),
    has_journal: !!r.has_journal,
    no_trade_day: !!r.no_trade_day,
    is_holiday: !!r.is_holiday,
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

// ── Yearly view (v0.3.0 Beat 1) ─────────────────────────────────────────────

interface YearMonthRowDb {
  ym: string            // 'YYYY-MM'
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  trading_days: number
  avg_winner: number | null
  avg_loser: number | null
}

// One-pass monthly roll-up for an entire year: SUM/COUNT grouped by
// substr(date,1,7), reusing the SAME win/loss predicates + SCRATCH_EPSILON as
// readMonthDays so the month tiles agree with the day cells at the scratch
// boundary. avg_winner / avg_loser are computed over TRADES (not by averaging
// the per-day averages, which would be statistically wrong). Returns ONLY the
// months that actually have trades, keyed by month (1..12); getCalendarYear
// fills the untraded months as zero rows.
function readYearMonths(
  db: ReturnType<typeof openDatabase>,
  year: number,
): Map<number, CalendarYearMonth> {
  const like = `${year}-%`
  const rows = db
    .prepare(`
      SELECT
        substr(date, 1, 7)   AS ym,
        SUM(net_pnl)         AS net_pnl,
        SUM(gross_pnl)       AS gross_pnl,
        SUM(total_fees)      AS total_fees,
        COUNT(*)             AS trade_count,
        SUM(CASE WHEN ${sqlIsWin()} THEN 1 ELSE 0 END)  AS winners,
        SUM(CASE WHEN ${sqlIsLoss()} THEN 1 ELSE 0 END) AS losers,
        COUNT(DISTINCT date) AS trading_days,
        AVG(CASE WHEN ${sqlIsWin()} THEN net_pnl END)   AS avg_winner,
        AVG(CASE WHEN ${sqlIsLoss()} THEN net_pnl END)  AS avg_loser
      FROM trades
      WHERE date LIKE ? AND deleted_at IS NULL
      GROUP BY ym
      ORDER BY ym
    `)
    // FOUR win/loss CASE `?` (winners, losers, then avg_winner, avg_loser)
    // precede the single `date LIKE ?` — same epsilon order as readMonthDays:
    // +eps (win count), -eps (loss count), +eps (avg win), -eps (avg loss), like.
    .all(SCRATCH_EPSILON, -SCRATCH_EPSILON, SCRATCH_EPSILON, -SCRATCH_EPSILON, like) as YearMonthRowDb[]

  const byMonth = new Map<number, CalendarYearMonth>()
  for (const r of rows) {
    const month = Number(r.ym.slice(5, 7))
    byMonth.set(month, {
      year,
      month,
      net_pnl: r.net_pnl,
      gross_pnl: r.gross_pnl,
      total_fees: r.total_fees,
      trade_count: r.trade_count,
      winners: r.winners,
      losers: r.losers,
      trading_days: r.trading_days,
      avg_winner: r.avg_winner,
      avg_loser: r.avg_loser,
    })
  }
  return byMonth
}

// Zero roll-up for an untraded month. trade_count 0 is the renderer's empty
// signal (em-dash, not $0); avg_winner/avg_loser null (no winners / no losers).
function emptyMonth(year: number, month: number): CalendarYearMonth {
  return {
    year,
    month,
    net_pnl: 0,
    gross_pnl: 0,
    total_fees: 0,
    trade_count: 0,
    winners: 0,
    losers: 0,
    trading_days: 0,
    avg_winner: null,
    avg_loser: null,
  }
}

// 12-month overview for a year. Mirrors getCalendarMonth's shape (opens the db,
// runs the roll-up, attaches the shared range). Always returns 12 tiles in
// calendar order (Jan..Dec) so the grid is stable regardless of which months
// were traded.
export function getCalendarYear(year: number): CalendarYear {
  const db = openDatabase()
  const byMonth = readYearMonths(db, year)
  const months: CalendarYearMonth[] = []
  for (let m = 1; m <= 12; m++) {
    months.push(byMonth.get(m) ?? emptyMonth(year, m))
  }
  return {
    year,
    months,
    range: readRange(db),
  }
}

// Daily aggregations + period roll-ups for the Reports Overview. Pure
// functions — no I/O, no electron, no DOM. Inputs are TradeListRow arrays
// and DateRanges; outputs are plain data structures that the renderer
// turns into charts and stat cards.

import type { TradeListRow } from '@shared/trades-types'
import { calendarDatesInRange, parseDate } from './dateUtils'
import type {
  CumulativePoint,
  DailyPnLPoint,
  DailyVolumePoint,
  DailyWinRatePoint,
  DateRange,
  DayPnL,
  PeriodMetrics,
} from './types'
import { isWin, isLoss } from '@/core/classify/outcome'
import { computeOutcomeStats } from '@/core/stats/outcomeStats'

/** Filter `trades` to those whose date sits inside the inclusive [from, to]
 *  window. Returns the input as-is when range is null. */
export function tradesInRange(
  trades: TradeListRow[],
  range: DateRange | null,
): TradeListRow[] {
  if (!range) return trades
  return trades.filter((t) => t.date >= range.from && t.date <= range.to)
}

/** Decide the X-axis for charts: every calendar day in the range when
 *  provided, otherwise the set of distinct dates that appear in the trade
 *  list (sorted ascending). */
function axisDates(trades: TradeListRow[], range: DateRange | null): string[] {
  if (range) return calendarDatesInRange(range)
  const set = new Set<string>()
  for (const t of trades) set.add(t.date)
  return Array.from(set).sort()
}

// ── Daily P&L ─────────────────────────────────────────────────────────────

export function computeDailyPnL(
  trades: TradeListRow[],
  range: DateRange | null,
): DailyPnLPoint[] {
  const scoped = tradesInRange(trades, range)
  const sum = new Map<string, { pnl: number; count: number }>()
  for (const t of scoped) {
    const cur = sum.get(t.date)
    if (cur) {
      cur.pnl += t.net_pnl
      cur.count += 1
    } else {
      sum.set(t.date, { pnl: t.net_pnl, count: 1 })
    }
  }
  return axisDates(scoped, range).map((date) => {
    const v = sum.get(date)
    return {
      date,
      pnl: v?.pnl ?? 0,
      tradeCount: v?.count ?? 0,
    }
  })
}

// ── Cumulative P&L ───────────────────────────────────────────────────────

export function computeCumulativePnL(
  trades: TradeListRow[],
  range: DateRange | null,
): CumulativePoint[] {
  const daily = computeDailyPnL(trades, range)
  let running = 0
  return daily.map((d) => {
    running += d.pnl
    return { date: d.date, cumulative: running }
  })
}

// ── Daily Volume ──────────────────────────────────────────────────────────

export function computeDailyVolume(
  trades: TradeListRow[],
  range: DateRange | null,
): DailyVolumePoint[] {
  const scoped = tradesInRange(trades, range)
  const sum = new Map<string, number>()
  for (const t of scoped) {
    const shares = (t.shares_bought ?? 0) + (t.shares_sold ?? 0)
    sum.set(t.date, (sum.get(t.date) ?? 0) + shares)
  }
  return axisDates(scoped, range).map((date) => ({
    date,
    volume: sum.get(date) ?? 0,
  }))
}

// ── Daily Win % ───────────────────────────────────────────────────────────

export function computeDailyWinRate(
  trades: TradeListRow[],
  range: DateRange | null,
): DailyWinRatePoint[] {
  const scoped = tradesInRange(trades, range)
  const agg = new Map<string, { wins: number; losses: number; count: number }>()
  for (const t of scoped) {
    let row = agg.get(t.date)
    if (!row) {
      row = { wins: 0, losses: 0, count: 0 }
      agg.set(t.date, row)
    }
    row.count += 1
    if (isWin(t.net_pnl)) row.wins += 1
    else if (isLoss(t.net_pnl)) row.losses += 1
  }
  return axisDates(scoped, range).map((date) => {
    const row = agg.get(date)
    if (!row) return { date, winRate: null, tradeCount: 0 }
    const decided = row.wins + row.losses
    return {
      date,
      winRate: decided > 0 ? row.wins / decided : null,
      tradeCount: row.count,
    }
  })
}

// ── Period roll-up ────────────────────────────────────────────────────────

function holdSeconds(t: TradeListRow): number | null {
  if (!t.close_time || t.is_open) return null
  const open = Date.parse(t.open_time)
  const close = Date.parse(t.close_time)
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null
  const s = (close - open) / 1000
  return s > 0 ? s : null
}

function meanOrNull(xs: number[]): number | null {
  if (xs.length === 0) return null
  let s = 0
  for (const v of xs) s += v
  return s / xs.length
}

export function computePeriodMetrics(
  trades: TradeListRow[],
  range: DateRange,
): PeriodMetrics {
  const scoped = tradesInRange(trades, range)
  // Convention-A outcome stats (win/loss/scratch counts, net, win rate, profit
  // factor, avg winner/loser) come from the shared helper. gross/fees, largest
  // winner/loser, and hold-time buckets are outside its scope — accumulated in
  // the same pass below.
  const s = computeOutcomeStats(scoped)
  const net = s.net_pnl
  const winners = s.winners
  const losers = s.losers
  const scratches = s.scratches

  let gross = 0
  let fees = 0
  let largestWinner: number | null = null
  let largestLoser: number | null = null
  const holdAll: number[] = []
  const holdWinners: number[] = []
  const holdLosers: number[] = []
  // Expectancy-R coverage: r_multiple is null without a logged stop/risk, so we
  // accumulate only the covered trades and report the count separately.
  const rMultiples: number[] = []

  for (const t of scoped) {
    gross += t.gross_pnl
    fees += t.total_fees
    if (isWin(t.net_pnl)) {
      if (largestWinner == null || t.net_pnl > largestWinner) largestWinner = t.net_pnl
    } else if (isLoss(t.net_pnl)) {
      if (largestLoser == null || t.net_pnl < largestLoser) largestLoser = t.net_pnl
    }
    if (t.r_multiple != null) rMultiples.push(t.r_multiple)
    const hs = holdSeconds(t)
    if (hs != null) {
      holdAll.push(hs)
      if (isWin(t.net_pnl)) holdWinners.push(hs)
      else if (isLoss(t.net_pnl)) holdLosers.push(hs)
    }
  }

  const winRate = s.win_rate
  const avgWinner = s.avg_winner
  const avgLoser = s.avg_loser
  const profitFactor = s.profit_factor
  const winLossRatio =
    avgWinner != null && avgLoser != null && avgLoser !== 0
      ? avgWinner / Math.abs(avgLoser)
      : null

  // Day-by-day P&L within the period for best/worst day + green/red-day
  // consistency. A DAY is classified green/red/breakeven by its AGGREGATE net
  // P&L (sum of that day's trades), NOT the per-trade scratch epsilon: a day
  // either made money (>0), lost money (<0), or netted exactly flat (===0).
  const byDate = new Map<string, number>()
  const days = new Set<string>()
  for (const t of scoped) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.net_pnl)
    days.add(t.date)
  }
  let best: DayPnL | null = null
  let worst: DayPnL | null = null
  let greenDays = 0
  let redDays = 0
  let breakevenDays = 0
  const greenDayPnls: number[] = []
  const redDayPnls: number[] = []
  let largestGreenDay: number | null = null
  let largestRedDay: number | null = null
  for (const [date, pnl] of byDate) {
    if (best == null || pnl > best.pnl) best = { date, pnl }
    if (worst == null || pnl < worst.pnl) worst = { date, pnl }
    if (pnl > 0) {
      greenDays += 1
      greenDayPnls.push(pnl)
      if (largestGreenDay == null || pnl > largestGreenDay) largestGreenDay = pnl
    } else if (pnl < 0) {
      redDays += 1
      redDayPnls.push(pnl)
      if (largestRedDay == null || pnl < largestRedDay) largestRedDay = pnl
    } else {
      breakevenDays += 1
    }
  }

  // Consecutive win/loss streaks — iterate in chronological order by
  // open_time so the streak count reflects how the trades actually played
  // out, not the storage order.
  const chrono = [...scoped].sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )
  let maxWinStreak = 0
  let maxLossStreak = 0
  let curWin = 0
  let curLoss = 0
  for (const t of chrono) {
    if (isWin(t.net_pnl)) {
      curWin += 1
      curLoss = 0
      if (curWin > maxWinStreak) maxWinStreak = curWin
    } else if (isLoss(t.net_pnl)) {
      curLoss += 1
      curWin = 0
      if (curLoss > maxLossStreak) maxLossStreak = curLoss
    } else {
      // Scratches don't extend either streak but they don't break one
      // either — they're treated as "no-ops" (same convention used by
      // electron/reports/get.ts).
    }
  }

  const tradingDays = days.size
  const avgTradePnL = scoped.length > 0 ? net / scoped.length : null
  const avgDailyPnL = tradingDays > 0 ? net / tradingDays : null
  const greenDayPct = tradingDays > 0 ? greenDays / tradingDays : null

  return {
    range,
    netPnL: net,
    grossPnL: gross,
    fees,
    avgTradePnL,
    avgDailyPnL,
    profitFactor,
    trades: scoped.length,
    winners,
    losers,
    scratches,
    tradingDays,
    avgHoldSeconds: meanOrNull(holdAll),
    avgHoldSecondsWinners: meanOrNull(holdWinners),
    avgHoldSecondsLosers: meanOrNull(holdLosers),
    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    winRate,
    avgWinner,
    avgLoser,
    largestWinner,
    largestLoser,
    winLossRatio,
    bestDay: best,
    worstDay: worst,
    greenDays,
    redDays,
    breakevenDays,
    avgGreenDay: meanOrNull(greenDayPnls),
    avgRedDay: meanOrNull(redDayPnls),
    largestGreenDay,
    largestRedDay,
    greenDayPct,
    expectancyR: meanOrNull(rMultiples),
    rCoverage: rMultiples.length,
  }
}

// ── Day-index trimming helpers used by alignByDayOfPeriod ────────────────

/** Trading days (with at least one trade) inside a period, ordered
 *  ascending. */
export function tradingDaysInPeriod(
  trades: TradeListRow[],
  range: DateRange,
): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (t.date >= range.from && t.date <= range.to) set.add(t.date)
  }
  return Array.from(set).sort()
}

/** All calendar days in range (used when we want the full bar chart with
 *  zero-pnl days). */
export function calendarDayPnLMap(
  trades: TradeListRow[],
  range: DateRange,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of trades) {
    if (t.date >= range.from && t.date <= range.to) {
      m.set(t.date, (m.get(t.date) ?? 0) + t.net_pnl)
    }
  }
  return m
}

/** Sort dates ascending by parsing (defensive; YYYY-MM-DD sorts ASCII
 *  identically, but exposes the helper for callers that build date arrays
 *  via Date math). */
export function sortDates(dates: string[]): string[] {
  return [...dates].sort((a, b) =>
    parseDate(a).getTime() - parseDate(b).getTime(),
  )
}

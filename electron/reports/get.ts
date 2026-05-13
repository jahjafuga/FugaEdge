import { openDatabase } from '../db/database'
import { getAllMarketRows, type MarketRow } from '../market/repo'
import { buildEquityCurve, computeDrawdown } from '../lib/equity'
import type {
  BucketStats,
  DayBreakdown,
  DrawdownInfo,
  FullStats,
  ReportsData,
  VolumeAnalysis,
} from '@shared/reports-types'

interface TradeForReport {
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  avg_buy_price: number
  avg_sell_price: number
  shares_bought: number
  shares_sold: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  mae: number | null
  mfe: number | null
}

const SCRATCH_THRESHOLD = 2 // |net_pnl| <= $2 counts as a scratch

function computeStats(trades: TradeForReport[], key: string, order: number): BucketStats {
  let net = 0
  let fees = 0
  let winnersSum = 0
  let winnersCount = 0
  let losersSum = 0
  let losersCount = 0
  let largestWinner: number | null = null
  let largestLoser: number | null = null

  for (const t of trades) {
    net += t.net_pnl
    fees += t.total_fees
    if (t.net_pnl > 0) {
      winnersSum += t.net_pnl
      winnersCount++
      if (largestWinner == null || t.net_pnl > largestWinner) largestWinner = t.net_pnl
    } else if (t.net_pnl < 0) {
      losersSum += t.net_pnl
      losersCount++
      if (largestLoser == null || t.net_pnl < largestLoser) largestLoser = t.net_pnl
    }
  }

  const decided = winnersCount + losersCount
  return {
    key,
    order,
    trade_count: trades.length,
    net_pnl: net,
    total_fees: fees,
    winners: winnersCount,
    losers: losersCount,
    win_rate: decided > 0 ? winnersCount / decided : null,
    avg_winner: winnersCount > 0 ? winnersSum / winnersCount : null,
    avg_loser: losersCount > 0 ? losersSum / losersCount : null,
    largest_winner: largestWinner,
    largest_loser: largestLoser,
    profit_factor:
      losersCount > 0 ? winnersSum / Math.abs(losersSum) : null,
  }
}

// Entry price for a round trip — what the trader paid per share to put the
// position on. For longs that's the buy avg, for shorts the sell avg. Falls
// back to whichever side has data.
function entryPrice(t: TradeForReport): number {
  if (t.side === 'short') {
    return t.avg_sell_price || t.avg_buy_price
  }
  return t.avg_buy_price || t.avg_sell_price
}

const PRICE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '$0–5',   min: 0,     max: 5 },
  { key: '$5–10',  min: 5,     max: 10 },
  { key: '$10–20', min: 10,    max: 20 },
  { key: '$20–50', min: 20,    max: 50 },
  { key: '$50+',   min: 50,    max: Number.POSITIVE_INFINITY },
]

function priceBucketKey(price: number): { key: string; order: number } | null {
  for (let i = 0; i < PRICE_BUCKETS.length; i++) {
    const b = PRICE_BUCKETS[i]
    if (price >= b.min && price < b.max) return { key: b.key, order: i }
  }
  return null
}

const SHARE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< 100',     min: 0,     max: 100 },
  { key: '100–500',   min: 100,   max: 500 },
  { key: '500–1k',    min: 500,   max: 1000 },
  { key: '1k–5k',     min: 1000,  max: 5000 },
  { key: '5k+',       min: 5000,  max: Number.POSITIVE_INFINITY },
]

function shareBucketKey(shares: number): { key: string; order: number } {
  for (let i = 0; i < SHARE_BUCKETS.length; i++) {
    const b = SHARE_BUCKETS[i]
    if (shares >= b.min && shares < b.max) return { key: b.key, order: i }
  }
  return { key: SHARE_BUCKETS[SHARE_BUCKETS.length - 1].key, order: SHARE_BUCKETS.length - 1 }
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// JS getDay(): Sun=0 Mon=1 ... Sat=6. We display Mon→Fri first (trading
// week), then Sat, then Sun for the rare weekend timestamp.
const DOW_DISPLAY_ORDER: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6,
}

function dowFromDate(iso: string): number {
  // Parse as local — fine for our purposes since 'date' is the open day.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function hourFromTime(iso: string): number {
  const h = Number(iso.slice(11, 13))
  return Number.isFinite(h) ? h : 0
}

function groupBy<T, K>(items: T[], keyOf: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const t of items) {
    const k = keyOf(t)
    const list = out.get(k)
    if (list) list.push(t)
    else out.set(k, [t])
  }
  return out
}

function sortByOrder(buckets: BucketStats[]): BucketStats[] {
  return [...buckets].sort((a, b) => a.order - b.order)
}

const SYMBOL_LIMIT = 25

function holdSeconds(open: string, close: string | null): number | null {
  if (!close) return null
  const o = new Date(open).getTime()
  const c = new Date(close).getTime()
  if (!Number.isFinite(o) || !Number.isFinite(c)) return null
  return Math.max(0, (c - o) / 1000)
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  let acc = 0
  for (const v of values) acc += (v - mean) ** 2
  return Math.sqrt(acc / (values.length - 1))
}

function maxConsecutive(
  trades: TradeForReport[],
  predicate: (t: TradeForReport) => boolean,
): number {
  // Trades are already sorted by time when we sort them in computeFullStats.
  let best = 0
  let cur = 0
  for (const t of trades) {
    if (predicate(t)) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  }
  return best
}

// Kestner-style K-Ratio over the daily equity curve. Regress cumulative
// daily P&L on day index, then t-statistic of the slope divided by √N.
// Higher == more consistent edge. Returns null when N < 3 or the regression
// is degenerate.
function computeKRatio(daily: { cumulative: number }[]): number | null {
  const n = daily.length
  if (n < 3) return null

  const xs = daily.map((_, i) => i + 1)
  const ys = daily.map((d) => d.cumulative)
  const xMean = xs.reduce((s, v) => s + v, 0) / n
  const yMean = ys.reduce((s, v) => s + v, 0) / n

  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i++) {
    sumXY += (xs[i] - xMean) * (ys[i] - yMean)
    sumXX += (xs[i] - xMean) ** 2
  }
  if (sumXX === 0) return null

  const slope = sumXY / sumXX
  const intercept = yMean - slope * xMean

  let rss = 0
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept
    rss += (ys[i] - predicted) ** 2
  }
  const residualSE = Math.sqrt(rss / (n - 2))
  if (residualSE === 0 || !Number.isFinite(residualSE)) return null
  const slopeSE = residualSE / Math.sqrt(sumXX)
  if (slopeSE === 0 || !Number.isFinite(slopeSE)) return null

  const t = slope / slopeSE
  return t / Math.sqrt(n)
}

// Probability that the result is random, given SQN. Uses the user-specified
// model 1 / (1 + SQN² × 0.1). SQN=0 → 100% random, SQN=5 → 29%, SQN=10 → 9%.
function computeRandomChance(sqn: number | null): number | null {
  if (sqn == null || !Number.isFinite(sqn)) return null
  return 1 / (1 + sqn * sqn * 0.1)
}

function computeFullStats(rows: TradeForReport[]): FullStats {
  // Sort by open_time so streak counts reflect chronological order.
  const trades = [...rows].sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )

  const pnls = trades.map((t) => t.net_pnl)
  const winners = trades.filter((t) => t.net_pnl > SCRATCH_THRESHOLD)
  const losers = trades.filter((t) => t.net_pnl < -SCRATCH_THRESHOLD)
  const scratches = trades.filter(
    (t) => t.net_pnl >= -SCRATCH_THRESHOLD && t.net_pnl <= SCRATCH_THRESHOLD,
  )

  const distinctDays = new Set(trades.map((t) => t.date)).size
  const totalNet = pnls.reduce((s, v) => s + v, 0)
  const totalGross = trades.reduce((s, t) => s + t.gross_pnl, 0)
  const totalFees = trades.reduce((s, t) => s + t.total_fees, 0)
  const totalShares = trades.reduce(
    (s, t) => s + t.shares_bought + t.shares_sold,
    0,
  )

  const avgTrade = trades.length > 0 ? totalNet / trades.length : null
  const avgDaily = distinctDays > 0 ? totalNet / distinctDays : null
  const avgPerShare = totalShares > 0 ? totalNet / totalShares : null
  const avgDailyVolume = distinctDays > 0 ? totalShares / distinctDays : null
  const sd = sampleStdDev(pnls)

  const decided = winners.length + losers.length
  const winRate = decided > 0 ? winners.length / decided : null
  const lossRate = winRate == null ? null : 1 - winRate

  const winnersSum = winners.reduce((s, t) => s + t.net_pnl, 0)
  const losersSum = losers.reduce((s, t) => s + t.net_pnl, 0)
  const avgWin = winners.length > 0 ? winnersSum / winners.length : null
  const avgLoss = losers.length > 0 ? losersSum / losers.length : null
  const profitFactor =
    losers.length > 0 ? winnersSum / Math.abs(losersSum) : null

  let kelly: number | null = null
  if (winRate !== null && lossRate !== null && avgWin !== null && avgLoss !== null && avgWin > 0) {
    kelly = (winRate - (lossRate * Math.abs(avgLoss)) / avgWin) * 100
  }

  let sqn: number | null = null
  if (avgTrade !== null && sd !== null && sd > 0 && trades.length > 0) {
    sqn = (avgTrade / sd) * Math.sqrt(trades.length)
  }

  const equity = buildEquityCurve(trades)
  const kRatio = computeKRatio(equity)

  const holdAll: number[] = []
  const holdWin: number[] = []
  const holdLoss: number[] = []
  const holdScratch: number[] = []
  for (const t of trades) {
    const h = holdSeconds(t.open_time, t.close_time)
    if (h === null) continue
    holdAll.push(h)
    if (t.net_pnl > SCRATCH_THRESHOLD) holdWin.push(h)
    else if (t.net_pnl < -SCRATCH_THRESHOLD) holdLoss.push(h)
    else holdScratch.push(h)
  }

  return {
    total_net_pnl: totalNet,
    total_gross_pnl: totalGross,
    total_fees: totalFees,
    total_commissions: null, // not in import; UI explains
    avg_trade_pnl: avgTrade,
    avg_daily_pnl: avgDaily,
    avg_winner: avgWin,
    avg_loser: avgLoss,
    avg_per_share_pnl: avgPerShare,
    std_dev_pnl: sd,
    profit_factor: profitFactor,
    total_shares_traded: totalShares,
    avg_daily_volume: avgDailyVolume,
    trade_count: trades.length,
    winners: winners.length,
    losers: losers.length,
    scratches: scratches.length,
    scratch_pct: trades.length > 0 ? scratches.length / trades.length : null,
    trading_days: distinctDays,
    avg_hold_seconds: meanOrNull(holdAll),
    avg_hold_seconds_winners: meanOrNull(holdWin),
    avg_hold_seconds_losers: meanOrNull(holdLoss),
    avg_hold_seconds_scratches: meanOrNull(holdScratch),
    max_consecutive_wins: maxConsecutive(trades, (t) => t.net_pnl > SCRATCH_THRESHOLD),
    max_consecutive_losses: maxConsecutive(trades, (t) => t.net_pnl < -SCRATCH_THRESHOLD),
    kelly_pct: kelly,
    sqn,
    k_ratio: kRatio,
    random_chance_pct: computeRandomChance(sqn),
    ...computeExcursionStats(trades),
  }
}

function entryPriceOf(t: TradeForReport): number {
  if (t.side === 'short') return t.avg_sell_price || t.avg_buy_price
  return t.avg_buy_price || t.avg_sell_price
}

function computeExcursionStats(trades: TradeForReport[]): {
  avg_mae: number | null
  avg_mfe: number | null
  avg_mae_dollars: number | null
  avg_mfe_dollars: number | null
  avg_mae_pct: number | null
  avg_mfe_pct: number | null
  excursion_coverage: number
} {
  const maeDollars: number[] = []
  const mfeDollars: number[] = []
  const maePct: number[] = []
  const mfePct: number[] = []
  let coverage = 0
  for (const t of trades) {
    if (t.mae == null && t.mfe == null) continue
    coverage++
    const entry = entryPriceOf(t)
    if (t.mae != null) {
      maeDollars.push(t.mae)
      if (entry > 0) maePct.push((t.mae / entry) * 100)
    }
    if (t.mfe != null) {
      mfeDollars.push(t.mfe)
      if (entry > 0) mfePct.push((t.mfe / entry) * 100)
    }
  }
  const avgMaeDollars = meanOrNull(maeDollars)
  const avgMfeDollars = meanOrNull(mfeDollars)
  return {
    avg_mae: avgMaeDollars,
    avg_mfe: avgMfeDollars,
    avg_mae_dollars: avgMaeDollars,
    avg_mfe_dollars: avgMfeDollars,
    avg_mae_pct: meanOrNull(maePct),
    avg_mfe_pct: meanOrNull(mfePct),
    excursion_coverage: coverage,
  }
}

function computeWinLossDays(trades: TradeForReport[]): DayBreakdown[] {
  const byDate = new Map<string, DayBreakdown>()
  for (const t of trades) {
    let d = byDate.get(t.date)
    if (!d) {
      d = {
        date: t.date,
        trade_count: 0,
        winners: 0,
        losers: 0,
        scratches: 0,
        gross_pnl: 0,
        total_fees: 0,
        net_pnl: 0,
      }
      byDate.set(t.date, d)
    }
    d.trade_count += 1
    d.gross_pnl += t.gross_pnl
    d.total_fees += t.total_fees
    d.net_pnl += t.net_pnl
    if (t.net_pnl > SCRATCH_THRESHOLD) d.winners += 1
    else if (t.net_pnl < -SCRATCH_THRESHOLD) d.losers += 1
    else d.scratches += 1
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
}

function computeDrawdownInfo(trades: TradeForReport[]): DrawdownInfo | null {
  const equity = buildEquityCurve(trades)
  const dd = computeDrawdown(equity)
  if (!dd) return null
  return {
    amount: dd.amount,
    percent: dd.percent,
    peak_date: dd.peak_date,
    peak_value: dd.peak_value,
    trough_date: dd.trough_date,
    trough_value: dd.trough_value,
    recovered: dd.recovered,
    recovery_date: dd.recovery_date,
    longest_period_days: dd.longest_period_days,
    current_drawdown: dd.current_drawdown,
    equity: dd.equity.map((p) => ({
      date: p.date,
      cumulative: p.cumulative,
      in_drawdown: p.in_drawdown,
    })),
  }
}

const FLOAT_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< 5M',     min: 0,        max: 5_000_000 },
  { key: '5–20M',    min: 5_000_000, max: 20_000_000 },
  { key: '20–100M',  min: 20_000_000, max: 100_000_000 },
  { key: '100M+',    min: 100_000_000, max: Number.POSITIVE_INFINITY },
]

function floatBucket(shares: number): { key: string; order: number } | null {
  if (!Number.isFinite(shares) || shares < 0) return null
  for (let i = 0; i < FLOAT_BUCKETS.length; i++) {
    const b = FLOAT_BUCKETS[i]
    if (shares >= b.min && shares < b.max) return { key: b.key, order: i }
  }
  return null
}

const RVOL_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '0–2×',   min: 0,  max: 2 },
  { key: '2–5×',   min: 2,  max: 5 },
  { key: '5–10×',  min: 5,  max: 10 },
  { key: '10×+',   min: 10, max: Number.POSITIVE_INFINITY },
]

function rvolBucket(rvol: number): { key: string; order: number } | null {
  if (!Number.isFinite(rvol) || rvol < 0) return null
  for (let i = 0; i < RVOL_BUCKETS.length; i++) {
    const b = RVOL_BUCKETS[i]
    if (rvol >= b.min && rvol < b.max) return { key: b.key, order: i }
  }
  return null
}

function computeVolumeAnalysis(trades: TradeForReport[]): VolumeAnalysis {
  const marketBySymbol = new Map<string, MarketRow>()
  for (const row of getAllMarketRows()) marketBySymbol.set(row.symbol, row)

  // If we have no market_data at all, surface the "unavailable" state with a
  // useful next-action message. This avoids showing an empty section.
  if (marketBySymbol.size === 0) {
    return {
      status: 'unavailable',
      reason:
        'No market data cached yet. Set your Massive API key in Settings ' +
        'and click "Refresh market data".',
      byFloat: [],
      byRvol: [],
      trades_analyzed: trades.length,
      trades_missing_data: trades.length,
    }
  }

  const byFloatMap = new Map<number, TradeForReport[]>()
  const byRvolMap = new Map<number, TradeForReport[]>()

  let analyzed = 0
  let missing = 0

  for (const t of trades) {
    const md = marketBySymbol.get(t.symbol)
    if (!md || md.error) {
      missing++
      continue
    }
    analyzed++

    if (md.float != null) {
      const fb = floatBucket(md.float)
      if (fb) {
        const list = byFloatMap.get(fb.order)
        if (list) list.push(t)
        else byFloatMap.set(fb.order, [t])
      }
    }

    if (md.avg_volume != null && md.avg_volume > 0) {
      const dayVol = md.daily_volumes[t.date]
      if (typeof dayVol === 'number' && dayVol > 0) {
        const rvol = dayVol / md.avg_volume
        const rb = rvolBucket(rvol)
        if (rb) {
          const list = byRvolMap.get(rb.order)
          if (list) list.push(t)
          else byRvolMap.set(rb.order, [t])
        }
      }
    }
  }

  const byFloat = sortByOrder(
    Array.from(byFloatMap.entries()).map(([order, ts]) =>
      computeStats(ts, FLOAT_BUCKETS[order].key, order),
    ),
  )
  const byRvol = sortByOrder(
    Array.from(byRvolMap.entries()).map(([order, ts]) =>
      computeStats(ts, RVOL_BUCKETS[order].key, order),
    ),
  )

  return {
    status: 'ready',
    byFloat,
    byRvol,
    trades_analyzed: analyzed,
    trades_missing_data: missing,
  }
}

export function getReports(): ReportsData {
  const db = openDatabase()
  const trades = db
    .prepare(`
      SELECT
        date, symbol, side, open_time, close_time,
        avg_buy_price, avg_sell_price,
        shares_bought, shares_sold,
        net_pnl, gross_pnl, total_fees,
        mae, mfe
      FROM trades
    `)
    .all() as TradeForReport[]

  // Price range
  const byPriceMap = new Map<number, TradeForReport[]>()
  for (const t of trades) {
    const bucket = priceBucketKey(entryPrice(t))
    if (!bucket) continue
    const list = byPriceMap.get(bucket.order)
    if (list) list.push(t)
    else byPriceMap.set(bucket.order, [t])
  }
  const byPriceRange = sortByOrder(
    Array.from(byPriceMap.entries()).map(([order, ts]) =>
      computeStats(ts, PRICE_BUCKETS[order].key, order),
    ),
  )

  // Day of week
  const byDowMap = groupBy(trades, (t) => dowFromDate(t.date))
  const byDayOfWeek = sortByOrder(
    Array.from(byDowMap.entries()).map(([dow, ts]) =>
      computeStats(ts, DOW_LABELS[dow], DOW_DISPLAY_ORDER[dow] ?? 99),
    ),
  )

  // Hour
  const byHourMap = groupBy(trades, (t) => hourFromTime(t.open_time))
  const byHour = sortByOrder(
    Array.from(byHourMap.entries()).map(([hour, ts]) =>
      computeStats(ts, `${hour < 10 ? '0' + hour : hour}:00`, hour),
    ),
  )

  // Symbol (top SYMBOL_LIMIT by trade count)
  const bySymbolMap = groupBy(trades, (t) => t.symbol)
  const bySymbolAll = Array.from(bySymbolMap.entries()).map(([sym, ts], i) =>
    computeStats(ts, sym, i),
  )
  bySymbolAll.sort((a, b) => b.trade_count - a.trade_count)
  const bySymbol = bySymbolAll.slice(0, SYMBOL_LIMIT).map((b, i) => ({ ...b, order: i }))

  // Share size (peak position size)
  const byShareMap = new Map<number, TradeForReport[]>()
  for (const t of trades) {
    const peak = Math.max(t.shares_bought, t.shares_sold)
    const bucket = shareBucketKey(peak)
    const list = byShareMap.get(bucket.order)
    if (list) list.push(t)
    else byShareMap.set(bucket.order, [t])
  }
  const byShareSize = sortByOrder(
    Array.from(byShareMap.entries()).map(([order, ts]) =>
      computeStats(ts, SHARE_BUCKETS[order].key, order),
    ),
  )

  return {
    byPriceRange,
    byDayOfWeek,
    byHour,
    bySymbol,
    byShareSize,
    fullStats: computeFullStats(trades),
    volumeAnalysis: computeVolumeAnalysis(trades),
    winLossDays: computeWinLossDays(trades),
    drawdown: computeDrawdownInfo(trades),
    trade_count: trades.length,
  }
}

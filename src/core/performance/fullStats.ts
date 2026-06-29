import { isWin, isLoss, isScratch } from '@/core/classify/outcome'
import type { FullStats } from '@shared/reports-types'
import { buildEquityCurve } from './equity'

// Full-account / per-period stat block (SQN, Kelly, K-Ratio, random chance,
// std dev, profit factor, per-share, daily volume, hold times, streaks,
// MAE/MFE, counts). Moved verbatim from electron/reports/get.ts so it runs in
// the renderer too — the per-period Compare feature calls it on each date
// range's trade subset. getReports re-imports it (output unchanged); the
// committed characterization test pins all 36 fields to prove this move is
// behaviour-preserving.
//
// Keyed on a MINIMAL trade shape both TradeForReport (main) and TradeListRow
// (renderer) satisfy structurally — only the ~13 fields the math reads.
export interface TradeForStats {
  date: string
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
  trades: TradeForStats[],
  predicate: (t: TradeForStats) => boolean,
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

export function computeFullStats(rows: TradeForStats[]): FullStats {
  // Sort by open_time so streak counts reflect chronological order.
  const trades = [...rows].sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )

  const pnls = trades.map((t) => t.net_pnl)
  const winners = trades.filter((t) => isWin(t.net_pnl))
  const losers = trades.filter((t) => isLoss(t.net_pnl))
  const scratches = trades.filter((t) => isScratch(t.net_pnl))

  const distinctDays = new Set(trades.map((t) => t.date)).size
  const totalNet = pnls.reduce((s, v) => s + v, 0)
  const totalGross = trades.reduce((s, t) => s + t.gross_pnl, 0)
  const totalFees = trades.reduce((s, t) => s + t.total_fees, 0)
  const totalShares = trades.reduce(
    (s, t) => s + t.shares_bought + t.shares_sold,
    0,
  )
  // Per-share P&L divides by POSITION size (one leg = max of the two), not the
  // both-leg sum above. totalShares stays both-leg — it feeds the volume stats
  // (total_shares_traded, avg_daily_volume), which legitimately count both legs.
  const totalPositionShares = trades.reduce(
    (s, t) => s + Math.max(t.shares_bought, t.shares_sold),
    0,
  )

  const avgTrade = trades.length > 0 ? totalNet / trades.length : null
  const avgDaily = distinctDays > 0 ? totalNet / distinctDays : null
  const avgPerShare = totalPositionShares > 0 ? totalNet / totalPositionShares : null
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

  // Per-share gain/loss + extremes (Phase 1, djsevans87). per-share = net_pnl /
  // position size (max of the two legs) — the SAME basis as avg_per_share_pnl
  // above. Unlike that pooled stat, these are per-TRADE means/extremes over the
  // winner/loser subsets (mirroring avg_winner/avg_loser). A zero-position row is
  // guarded out. Null when the side has no qualifying trades (em-dash downstream).
  const perShareOf = (t: TradeForStats): number | null => {
    const pos = Math.max(t.shares_bought, t.shares_sold)
    return pos > 0 ? t.net_pnl / pos : null
  }
  const winnerPerShares = winners.map(perShareOf).filter((v): v is number => v != null)
  const loserPerShares = losers.map(perShareOf).filter((v): v is number => v != null)
  const avgPerShareGain = meanOrNull(winnerPerShares)
  const avgPerShareLoss = meanOrNull(loserPerShares)
  const maxPerShareWin = winnerPerShares.length > 0 ? Math.max(...winnerPerShares) : null
  const maxPerShareLoss = loserPerShares.length > 0 ? Math.min(...loserPerShares) : null

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
    if (isWin(t.net_pnl)) holdWin.push(h)
    else if (isLoss(t.net_pnl)) holdLoss.push(h)
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
    avg_per_share_gain: avgPerShareGain,
    avg_per_share_loss: avgPerShareLoss,
    max_per_share_win: maxPerShareWin,
    max_per_share_loss: maxPerShareLoss,
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
    max_consecutive_wins: maxConsecutive(trades, (t) => isWin(t.net_pnl)),
    max_consecutive_losses: maxConsecutive(trades, (t) => isLoss(t.net_pnl)),
    kelly_pct: kelly,
    sqn,
    k_ratio: kRatio,
    random_chance_pct: computeRandomChance(sqn),
    ...computeExcursionStats(trades),
  }
}

function entryPriceOf(t: TradeForStats): number {
  if (t.side === 'short') return t.avg_sell_price || t.avg_buy_price
  return t.avg_buy_price || t.avg_sell_price
}

function computeExcursionStats(trades: TradeForStats[]): {
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

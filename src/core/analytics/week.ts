import type { TradeListRow } from '@shared/trades-types'
import type { WeekMetrics } from '@shared/week-types'
import type { ExitDelta } from '@shared/analytics-types'

interface ComputeWeekMetricsInput {
  /** Trades already scoped to the week (the repo filters by trades.date). */
  trades: TradeListRow[]
  /** Saturday of the week, YYYY-MM-DD — the streak walks back from here. */
  weekEnd: string
  /** All-trades daily net P&L (date → net) so the streak can reach prior
   *  weeks. Falls back to the week's own days when omitted. */
  dailyPnl?: Map<string, number>
  /** Per-trade best-exit gaps for the week's trades (derived in the repo via
   *  computeExitDeltas). Omitted/empty → Money Left renders the empty state. */
  exitDeltas?: ExitDelta[]
}

// v0.2.2 Day 4.5b — pure week-scoped metrics for the Weekly Review modal.
// Mirrors src/core/analytics/day.ts conventions over the week's trades, plus
// week-shaped fields. (The day↔week convention overlap, and the
// computeWeekMetrics↔getWeeklySummaries grid overlap, are deliberately not
// unified — logged for v0.3.0 consolidation, not built now.)
export function computeWeekMetrics(input: ComputeWeekMetricsInput): WeekMetrics {
  const { trades, weekEnd, dailyPnl, exitDeltas } = input

  let grossPnl = 0
  let totalFees = 0
  let netPnl = 0
  let winCount = 0
  let lossCount = 0
  let scratchCount = 0
  let winnerSum = 0
  let loserSum = 0
  let rSum = 0
  let rCount = 0
  let totalShares = 0
  let totalDollarVolume = 0
  // MAE/MFE in $/share — averaged over covered trades only (v0.2.2 Day 5a).
  let mfeSum = 0
  let mfeCount = 0
  let maeSum = 0
  let maeCount = 0
  // Single biggest winning / worst losing TRADE (sign-gated, mirrors day.ts).
  let biggestWin: { symbol: string; pnl: number } | null = null
  let worstLoss: { symbol: string; pnl: number } | null = null
  // Per-symbol: count + net, first-seen index for a stable sort tiebreak.
  const symbolAgg = new Map<string, { tradeCount: number; netPnl: number; firstSeen: number }>()
  // Per-trade mistake tag occurrences across the week.
  const mistakeCounts = new Map<string, number>()
  // Per-playbook (tagged trades only).
  const playbookAgg = new Map<string, { tradeCount: number; netPnl: number; winners: number; losers: number }>()
  // Per-day net + count.
  const dayAgg = new Map<string, { netPnl: number; tradeCount: number }>()

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    grossPnl += t.gross_pnl
    totalFees += t.total_fees
    netPnl += t.net_pnl

    if (t.net_pnl > 0) {
      winCount += 1
      winnerSum += t.net_pnl
      if (biggestWin === null || t.net_pnl > biggestWin.pnl) {
        biggestWin = { symbol: t.symbol, pnl: t.net_pnl }
      }
    } else if (t.net_pnl < 0) {
      lossCount += 1
      loserSum += t.net_pnl
      if (worstLoss === null || t.net_pnl < worstLoss.pnl) {
        worstLoss = { symbol: t.symbol, pnl: t.net_pnl }
      }
    } else {
      scratchCount += 1
    }

    if (t.r_multiple !== null) {
      rSum += t.r_multiple
      rCount += 1
    }
    if (t.mfe !== null) {
      mfeSum += t.mfe
      mfeCount += 1
    }
    if (t.mae !== null) {
      maeSum += t.mae
      maeCount += 1
    }
    totalShares += t.shares_bought + t.shares_sold
    totalDollarVolume += t.shares_bought * t.avg_buy_price + t.shares_sold * t.avg_sell_price

    const sym = symbolAgg.get(t.symbol) ?? { tradeCount: 0, netPnl: 0, firstSeen: i }
    sym.tradeCount += 1
    sym.netPnl += t.net_pnl
    symbolAgg.set(t.symbol, sym)

    for (const tag of t.mistakes) {
      mistakeCounts.set(tag, (mistakeCounts.get(tag) ?? 0) + 1)
    }

    if (t.playbook_name !== null) {
      const pb = playbookAgg.get(t.playbook_name) ?? { tradeCount: 0, netPnl: 0, winners: 0, losers: 0 }
      pb.tradeCount += 1
      pb.netPnl += t.net_pnl
      if (t.net_pnl > 0) pb.winners += 1
      else if (t.net_pnl < 0) pb.losers += 1
      playbookAgg.set(t.playbook_name, pb)
    }

    const day = dayAgg.get(t.date) ?? { netPnl: 0, tradeCount: 0 }
    day.netPnl += t.net_pnl
    day.tradeCount += 1
    dayAgg.set(t.date, day)
  }

  const decided = winCount + lossCount
  const winRate = decided > 0 ? winCount / decided : null
  const avgWin = winCount > 0 ? winnerSum / winCount : null
  const avgLoss = lossCount > 0 ? loserSum / lossCount : null
  const avgRMultiple = rCount > 0 ? rSum / rCount : null
  const avgPerShareGainLoss = totalShares > 0 ? netPnl / totalShares : null
  const avgMfeDollars = mfeCount > 0 ? mfeSum / mfeCount : null
  const avgMaeDollars = maeCount > 0 ? maeSum / maeCount : null

  let profitFactor: number | null = null
  if (decided > 0) {
    profitFactor = loserSum === 0 ? Infinity : winnerSum / -loserSum
  }

  // P&L Ratio — avg win ÷ |avg loss| (distinct from profit factor). No losers →
  // Infinity; no winners → 0; no decided → null. Mirrors day.ts.
  let pnlRatio: number | null = null
  if (decided > 0) {
    pnlRatio = avgLoss === null ? Infinity : (avgWin ?? 0) / Math.abs(avgLoss)
  }

  // Symbols: net desc, then count desc, then first-seen asc (stable).
  const symbolBreakdown = [...symbolAgg.entries()]
    .map(([symbol, a]) => ({ symbol, tradeCount: a.tradeCount, netPnl: a.netPnl, firstSeen: a.firstSeen }))
    .sort((a, b) => {
      if (a.netPnl !== b.netPnl) return b.netPnl - a.netPnl
      if (a.tradeCount !== b.tradeCount) return b.tradeCount - a.tradeCount
      return a.firstSeen - b.firstSeen
    })
    .map(({ symbol, tradeCount, netPnl }) => ({ symbol, tradeCount, netPnl }))

  // Mistake tags: count desc, then alphabetical.
  const mistakeTagCounts = [...mistakeCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  // Per-playbook: net desc, then count desc, then name.
  const perPlaybook = [...playbookAgg.entries()]
    .map(([playbook, a]) => ({
      playbook,
      tradeCount: a.tradeCount,
      netPnl: a.netPnl,
      winRate: a.winners + a.losers > 0 ? a.winners / (a.winners + a.losers) : null,
    }))
    .sort((a, b) => {
      if (a.netPnl !== b.netPnl) return b.netPnl - a.netPnl
      if (a.tradeCount !== b.tradeCount) return b.tradeCount - a.tradeCount
      return a.playbook.localeCompare(b.playbook)
    })

  // Day-by-day: chronological asc.
  const dayByDay = [...dayAgg.entries()]
    .map(([date, a]) => ({ date, netPnl: a.netPnl, tradeCount: a.tradeCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const tradingDays = dayByDay.length
  const greenDays = dayByDay.filter((d) => d.netPnl > 0).length

  // Best/worst DAY — sign-gated (mirrors day.ts biggestWin/worstLoss).
  let bestDay: { date: string; netPnl: number } | null = null
  let worstDay: { date: string; netPnl: number } | null = null
  for (const d of dayByDay) {
    if (d.netPnl > 0 && (bestDay === null || d.netPnl > bestDay.netPnl)) {
      bestDay = { date: d.date, netPnl: d.netPnl }
    }
    if (d.netPnl < 0 && (worstDay === null || d.netPnl < worstDay.netPnl)) {
      worstDay = { date: d.date, netPnl: d.netPnl }
    }
  }

  // Sample std dev of per-day net P&L; null when < 3 trading days.
  let dayPnlStdDev: number | null = null
  if (tradingDays >= 3) {
    const mean = dayByDay.reduce((s, d) => s + d.netPnl, 0) / tradingDays
    const sumSq = dayByDay.reduce((s, d) => s + (d.netPnl - mean) ** 2, 0)
    dayPnlStdDev = Math.sqrt(sumSq / (tradingDays - 1))
  }

  // Streak into the week end — from the all-trades daily map when provided,
  // else the week's own days.
  const streakMap =
    dailyPnl ?? new Map(dayByDay.map((d) => [d.date, d.netPnl]))
  const streak = computeStreak(weekEnd, streakMap)

  // Money Left on Table — week-scoped sum of per-trade ExitDelta.delta. Mirrors
  // day.ts: 0 coverage surfaces as null (UI shows the empty state) rather than a
  // misleading $0.00 total.
  let moneyLeftOnTable: number | null = null
  let moneyLeftCoverage: WeekMetrics['moneyLeftCoverage'] = null
  if (exitDeltas && exitDeltas.length > 0) {
    moneyLeftOnTable = exitDeltas.reduce((sum, ed) => sum + ed.delta, 0)
    moneyLeftCoverage = { withMfe: exitDeltas.length, total: trades.length }
  }

  return {
    netPnl,
    grossPnl,
    totalFees,
    tradeCount: trades.length,
    winCount,
    lossCount,
    scratchCount,
    winRate,
    profitFactor,
    pnlRatio,
    avgWin,
    avgLoss,
    biggestWin,
    worstLoss,
    avgRMultiple,
    totalDollarVolume,
    avgPerShareGainLoss,
    avgMfeDollars,
    avgMaeDollars,
    moneyLeftOnTable,
    moneyLeftCoverage,
    symbolBreakdown,
    mistakeTagCounts,
    dayByDay,
    bestDay,
    worstDay,
    perPlaybook,
    greenDays,
    tradingDays,
    dayPnlStdDev,
    streak,
  }
}

// Walk backwards from weekEnd through daily P&L. Returns the consecutive-day
// streak whose sign matches the most recent traded day on/before weekEnd.
// Ported from electron/calendar/weekly.ts (grid path) into core.
export function computeStreak(
  weekEnd: string,
  dailyPnl: Map<string, number>,
): { kind: 'win' | 'loss' | 'none'; days: number } {
  const days = [...dailyPnl.keys()]
    .filter((d) => d <= weekEnd)
    .sort((a, b) => (a < b ? 1 : -1))
  if (days.length === 0) return { kind: 'none', days: 0 }
  const firstPnl = dailyPnl.get(days[0]) ?? 0
  if (firstPnl === 0) return { kind: 'none', days: 0 }
  const kind: 'win' | 'loss' = firstPnl > 0 ? 'win' : 'loss'
  let count = 0
  for (const d of days) {
    const pnl = dailyPnl.get(d) ?? 0
    if (kind === 'win' ? pnl > 0 : pnl < 0) count += 1
    else break
  }
  return { kind, days: count }
}

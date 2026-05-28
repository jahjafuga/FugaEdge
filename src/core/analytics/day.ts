import type { TradeListRow } from '@shared/trades-types'
import type { ExitDelta } from '@shared/analytics-types'
import type { DayMetrics } from '@shared/day-types'
import { formatEastern } from '@/lib/format'

interface ComputeDayMetricsInput {
  date: string
  trades: TradeListRow[]
  exitDeltas: ExitDelta[]
}

export function computeDayMetrics(input: ComputeDayMetricsInput): DayMetrics {
  const { date, trades, exitDeltas } = input
  const dayOfWeek = deriveDayOfWeek(date)

  if (trades.length === 0) {
    return emptyMetrics(date, dayOfWeek)
  }

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
  let earliestOpen: string | null = null
  let latestClose: string | null = null
  let biggestWin: { symbol: string; pnl: number } | null = null
  let worstLoss: { symbol: string; pnl: number } | null = null
  // Hold-time accumulators. Trades without close_time are skipped (still-open
  // trades shouldn't appear in a day-detail view, but guard defensively).
  let holdSecondsTotal = 0
  let holdSecondsTotalCount = 0
  let holdSecondsWinnersTotal = 0
  let holdSecondsWinnersCount = 0
  let holdSecondsLosersTotal = 0
  let holdSecondsLosersCount = 0
  let holdSecondsScratchesTotal = 0
  let holdSecondsScratchesCount = 0
  // Per-symbol aggregation: count + net P&L, with first-seen index as the
  // final tiebreaker for a stable sort.
  const symbolAgg = new Map<string, { tradeCount: number; netPnl: number; firstSeen: number }>()
  const playbookAgg = new Map<string, { tradeCount: number; winners: number; losers: number }>()

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

    totalShares += t.shares_bought + t.shares_sold
    totalDollarVolume += t.shares_bought * t.avg_buy_price + t.shares_sold * t.avg_sell_price

    if (earliestOpen === null || t.open_time < earliestOpen) {
      earliestOpen = t.open_time
    }
    const endTime = t.close_time ?? t.open_time
    if (latestClose === null || endTime > latestClose) {
      latestClose = endTime
    }

    // Hold seconds — only when close_time is present and both timestamps parse.
    // Both timestamps are in the same TZ so the delta is TZ-independent.
    if (t.close_time !== null) {
      const open = Date.parse(t.open_time)
      const close = Date.parse(t.close_time)
      if (!Number.isNaN(open) && !Number.isNaN(close)) {
        const seconds = (close - open) / 1000
        holdSecondsTotal += seconds
        holdSecondsTotalCount += 1
        if (t.net_pnl > 0) {
          holdSecondsWinnersTotal += seconds
          holdSecondsWinnersCount += 1
        } else if (t.net_pnl < 0) {
          holdSecondsLosersTotal += seconds
          holdSecondsLosersCount += 1
        } else {
          holdSecondsScratchesTotal += seconds
          holdSecondsScratchesCount += 1
        }
      }
    }

    const sym = symbolAgg.get(t.symbol) ?? { tradeCount: 0, netPnl: 0, firstSeen: i }
    sym.tradeCount += 1
    sym.netPnl += t.net_pnl
    symbolAgg.set(t.symbol, sym)

    if (t.playbook_name !== null) {
      const agg = playbookAgg.get(t.playbook_name) ?? { tradeCount: 0, winners: 0, losers: 0 }
      agg.tradeCount += 1
      if (t.net_pnl > 0) agg.winners += 1
      else if (t.net_pnl < 0) agg.losers += 1
      playbookAgg.set(t.playbook_name, agg)
    }
  }

  const decided = winCount + lossCount
  const winRate = decided > 0 ? winCount / decided : null
  const avgWin = winCount > 0 ? winnerSum / winCount : null
  const avgLoss = lossCount > 0 ? loserSum / lossCount : null
  const avgRMultiple = rCount > 0 ? rSum / rCount : null
  const avgTradePnl = trades.length > 0 ? netPnl / trades.length : null
  const avgPerShareGainLoss = totalShares > 0 ? netPnl / totalShares : null

  // Profit factor convention (see v0.2.2 plan addendum):
  //   - finite (>0) when both sides have flow
  //   - Infinity when winners exist but no losers (real winning-only outcome)
  //   - null when no decided trades
  // loserSum is accumulated as a negative quantity above; flip its sign.
  let profitFactor: number | null = null
  if (decided > 0) {
    profitFactor = loserSum === 0 ? Infinity : winnerSum / -loserSum
  }

  // Sample std dev (n−1 denominator). Null when tradeCount < 3 — at small N
  // the value is statistical noise (Class C in the v0.2.2 plan addendum).
  let stdDevPnl: number | null = null
  if (trades.length >= 3) {
    const mean = netPnl / trades.length
    let sumSquaredDeviations = 0
    for (const t of trades) sumSquaredDeviations += (t.net_pnl - mean) ** 2
    stdDevPnl = Math.sqrt(sumSquaredDeviations / (trades.length - 1))
  }

  const avgHoldSeconds = holdSecondsTotalCount > 0 ? holdSecondsTotal / holdSecondsTotalCount : null
  const avgHoldSecondsWinners = holdSecondsWinnersCount > 0 ? holdSecondsWinnersTotal / holdSecondsWinnersCount : null
  const avgHoldSecondsLosers = holdSecondsLosersCount > 0 ? holdSecondsLosersTotal / holdSecondsLosersCount : null
  const avgHoldSecondsScratches = holdSecondsScratchesCount > 0 ? holdSecondsScratchesTotal / holdSecondsScratchesCount : null

  // Chronological streak scan. Scratches break BOTH streaks (matches the
  // Tradervue Detailed convention documented in the v0.2.2 plan addendum).
  // We sort a shallow copy so the caller's array isn't mutated.
  const chrono = [...trades].sort((a, b) => a.open_time.localeCompare(b.open_time))
  let curWinStreak = 0
  let curLossStreak = 0
  let maxConsecutiveWins = 0
  let maxConsecutiveLosses = 0
  for (const t of chrono) {
    if (t.net_pnl > 0) {
      curWinStreak += 1
      curLossStreak = 0
      if (curWinStreak > maxConsecutiveWins) maxConsecutiveWins = curWinStreak
    } else if (t.net_pnl < 0) {
      curLossStreak += 1
      curWinStreak = 0
      if (curLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = curLossStreak
    } else {
      curWinStreak = 0
      curLossStreak = 0
    }
  }

  // Rank by net P&L desc (best first), then trade count desc, then first-seen
  // asc — a stable order for the Overview "what did I trade today" breakdown.
  const symbolBreakdown = [...symbolAgg.entries()]
    .map(([symbol, agg]) => ({ symbol, tradeCount: agg.tradeCount, netPnl: agg.netPnl, firstSeen: agg.firstSeen }))
    .sort((a, b) => {
      if (a.netPnl !== b.netPnl) return b.netPnl - a.netPnl
      if (a.tradeCount !== b.tradeCount) return b.tradeCount - a.tradeCount
      return a.firstSeen - b.firstSeen
    })
    .map(({ symbol, tradeCount, netPnl }) => ({ symbol, tradeCount, netPnl }))

  let mostUsedPlaybook: DayMetrics['mostUsedPlaybook'] = null
  for (const [name, agg] of playbookAgg) {
    if (mostUsedPlaybook === null || agg.tradeCount > mostUsedPlaybook.tradeCount) {
      const pbDecided = agg.winners + agg.losers
      mostUsedPlaybook = {
        playbook: name,
        tradeCount: agg.tradeCount,
        winRate: pbDecided > 0 ? agg.winners / pbDecided : null,
      }
    }
  }

  // Money Left on Table — day-scoped sum of per-trade ExitDelta.delta.
  // Honest disclosure of partial coverage per Decision 3 in the v0.2.2 plan:
  // 0/N coverage surfaces as null (UI shows "awaiting intraday data") rather
  // than a misleading $0.00 total.
  let moneyLeftOnTable: number | null = null
  let moneyLeftCoverage: DayMetrics['moneyLeftCoverage'] = null
  if (exitDeltas.length > 0) {
    moneyLeftOnTable = exitDeltas.reduce((sum, ed) => sum + ed.delta, 0)
    moneyLeftCoverage = { withMfe: exitDeltas.length, total: trades.length }
  }

  const first = trades.reduce(
    (earliest, t) => (earliest === null || t.open_time < earliest.open_time ? t : earliest),
    null as TradeListRow | null,
  )
  const firstTradePnl = first
    ? { symbol: first.symbol, pnl: first.net_pnl, rMultiple: first.r_multiple }
    : null

  return {
    date,
    dayOfWeek,
    grossPnl,
    totalFees,
    netPnl,
    tradeCount: trades.length,
    winCount,
    lossCount,
    scratchCount,
    winRate,
    biggestWin,
    worstLoss,
    firstTradePnl,
    avgRMultiple,
    avgWin,
    avgLoss,
    sessionFirstTradeTime: earliestOpen ? toEasternHHMM(earliestOpen) : null,
    sessionLastTradeTime: latestClose ? toEasternHHMM(latestClose) : null,
    symbolBreakdown,
    totalShares,
    totalDollarVolume,
    mostUsedPlaybook,
    moneyLeftOnTable,
    moneyLeftCoverage,
    // Day 2 fields — placeholder defaults; each gets a real computation
    // below as its TDD cycle lands.
    avgTradePnl,
    avgPerShareGainLoss,
    profitFactor,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgHoldSeconds,
    avgHoldSecondsWinners,
    avgHoldSecondsLosers,
    avgHoldSecondsScratches,
    stdDevPnl,
    avgMfeDollars: null,
    avgMaeDollars: null,
  }
}

function emptyMetrics(date: string, dayOfWeek: string): DayMetrics {
  return {
    date,
    dayOfWeek,
    grossPnl: 0,
    totalFees: 0,
    netPnl: 0,
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    scratchCount: 0,
    winRate: null,
    biggestWin: null,
    worstLoss: null,
    firstTradePnl: null,
    avgRMultiple: null,
    avgWin: null,
    avgLoss: null,
    sessionFirstTradeTime: null,
    sessionLastTradeTime: null,
    symbolBreakdown: [],
    totalShares: 0,
    totalDollarVolume: 0,
    mostUsedPlaybook: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    avgTradePnl: null,
    avgPerShareGainLoss: null,
    profitFactor: null,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    avgHoldSeconds: null,
    avgHoldSecondsWinners: null,
    avgHoldSecondsLosers: null,
    avgHoldSecondsScratches: null,
    stdDevPnl: null,
    avgMfeDollars: null,
    avgMaeDollars: null,
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toEasternHHMM(utcTimestamp: string): string {
  // open_time/close_time are stored UTC (Day 8.5 migration). Render the
  // Eastern wall-clock HH:MM — the convention the rest of the app uses
  // (TradesTable, IntradayPnLChart). A prior slice(11,16) here showed UTC,
  // ~4-5h off, surfaced during v0.2.2 Day 3.
  return formatEastern(utcTimestamp).slice(0, 5)
}

function deriveDayOfWeek(isoDate: string): string {
  // Parse as local-time Y-M-D — avoids the UTC-midnight pitfall that
  // `new Date('2026-05-15')` introduces when the local TZ is west of UTC
  // (the date would roll back to the prior weekday).
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return DAY_NAMES[date.getDay()]
}

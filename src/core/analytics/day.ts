import type { TradeListRow } from '@shared/trades-types'
import type { ExitDelta } from '@shared/analytics-types'
import type { DayMetrics } from '@shared/day-types'

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
  const symbolCounts = new Map<string, number>()
  // Insertion order tracks first-seen — used as the tiebreaker when multiple
  // symbols share the same trade count in the top-3 ranking.
  const symbolFirstSeen = new Map<string, number>()
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

    symbolCounts.set(t.symbol, (symbolCounts.get(t.symbol) ?? 0) + 1)
    if (!symbolFirstSeen.has(t.symbol)) symbolFirstSeen.set(t.symbol, i)

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

  const symbolsTraded = [...symbolCounts.keys()]
  // Rank by tradeCount desc, then first-seen index asc (stable tiebreak).
  const topThreeSymbols = symbolsTraded
    .map((symbol) => ({ symbol, tradeCount: symbolCounts.get(symbol)! }))
    .sort((a, b) => {
      if (a.tradeCount !== b.tradeCount) return b.tradeCount - a.tradeCount
      return (symbolFirstSeen.get(a.symbol) ?? 0) - (symbolFirstSeen.get(b.symbol) ?? 0)
    })
    .slice(0, 3)

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
    sessionFirstTradeTime: earliestOpen ? extractHHMM(earliestOpen) : null,
    sessionLastTradeTime: latestClose ? extractHHMM(latestClose) : null,
    symbolsTraded,
    topThreeSymbols,
    totalShares,
    totalDollarVolume,
    mostUsedPlaybook,
    moneyLeftOnTable,
    moneyLeftCoverage,
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
    symbolsTraded: [],
    topThreeSymbols: [],
    totalShares: 0,
    totalDollarVolume: 0,
    mostUsedPlaybook: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function extractHHMM(isoTimestamp: string): string {
  // open_time/close_time are ISO-ish "YYYY-MM-DDTHH:MM:SS" — positions 11..16 carry HH:MM.
  return isoTimestamp.slice(11, 16)
}

function deriveDayOfWeek(isoDate: string): string {
  // Parse as local-time Y-M-D — avoids the UTC-midnight pitfall that
  // `new Date('2026-05-15')` introduces when the local TZ is west of UTC
  // (the date would roll back to the prior weekday).
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return DAY_NAMES[date.getDay()]
}

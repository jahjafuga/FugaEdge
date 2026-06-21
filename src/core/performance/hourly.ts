// Per-hour aggregation for the Compare-tab Time-of-Day quad. Buckets a period's
// trades by US-Eastern wall-clock hour — the SAME derivation get.ts buildByHour
// (hourFromTime) and comparison.ts dimensionKey('hour') use — so the single-
// period and A/B views all agree on which hour a trade lands in. Pure: no
// electron/DB/React imports, so it runs renderer-side now and server-side in the
// future SaaS port.
//
// Profit-factor honesty: an hour with winners but ZERO losers has an UNDEFINED
// profit factor (gross win / 0). We mirror fullStats.ts exactly — profit_factor
// is null when there are no losing trades (rendered as a gap / em-dash, never
// Infinity or a fabricated number). win_rate is likewise null when no trade is
// decided (an hour of only scratches).

import { isWin, isLoss } from '@/core/classify/outcome'
import { utcToEasternParts } from '@/lib/format'
import type { DateRange } from './types'

/** Minimal trade shape the hour math reads — TradeListRow satisfies it. */
export interface TradeForHourly {
  date: string
  open_time: string
  net_pnl: number
}

export interface HourMetrics {
  net_pnl: number
  /** gross win / |gross loss|; null when the hour had NO losing trades. */
  profit_factor: number | null
  /** winners / (winners + losers), 0..1; null when no decided trade. */
  win_rate: number | null
  trade_count: number
}

export interface HourlyComparisonRow {
  hour: number // 0..23, US-Eastern
  label: string // "09:00"
  a: HourMetrics
  b: HourMetrics
}

interface HourAcc {
  net: number
  n: number
  winners: number
  losers: number
  winSum: number
  lossSum: number
}

function emptyMetrics(): HourMetrics {
  return { net_pnl: 0, profit_factor: null, win_rate: null, trade_count: 0 }
}

function finalize(acc: HourAcc): HourMetrics {
  const decided = acc.winners + acc.losers
  return {
    net_pnl: acc.net,
    trade_count: acc.n,
    win_rate: decided > 0 ? acc.winners / decided : null,
    // Mirror fullStats.ts: PF only when there ARE losers, else null — never Infinity.
    profit_factor: acc.losers > 0 ? acc.winSum / Math.abs(acc.lossSum) : null,
  }
}

/** Bucket a period's trades by Eastern hour → per-hour metrics. */
export function bucketTradesByHour(trades: TradeForHourly[]): Map<number, HourMetrics> {
  const acc = new Map<number, HourAcc>()
  for (const t of trades) {
    const parts = utcToEasternParts(t.open_time)
    if (!parts) continue
    let cur = acc.get(parts.hour)
    if (!cur) {
      cur = { net: 0, n: 0, winners: 0, losers: 0, winSum: 0, lossSum: 0 }
      acc.set(parts.hour, cur)
    }
    cur.net += t.net_pnl
    cur.n += 1
    if (isWin(t.net_pnl)) {
      cur.winners += 1
      cur.winSum += t.net_pnl
    } else if (isLoss(t.net_pnl)) {
      cur.losers += 1
      cur.lossSum += t.net_pnl
    }
  }
  const out = new Map<number, HourMetrics>()
  for (const [hr, a] of acc) out.set(hr, finalize(a))
  return out
}

/** Per-hour A-vs-B comparison. Filters to each range inline (the same inclusive
 *  date-string test computeBreakdownComparison uses), buckets each side by hour,
 *  and zips by hour (union, ascending). Hours absent in a period read as empty
 *  metrics (0 trades) so the paired bars line up. */
export function computeHourlyComparison(
  trades: TradeForHourly[],
  rangeA: DateRange,
  rangeB: DateRange,
): HourlyComparisonRow[] {
  const inA = trades.filter((t) => t.date >= rangeA.from && t.date <= rangeA.to)
  const inB = trades.filter((t) => t.date >= rangeB.from && t.date <= rangeB.to)
  const a = bucketTradesByHour(inA)
  const b = bucketTradesByHour(inB)
  const hours = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x - y)
  return hours.map((hr) => ({
    hour: hr,
    label: `${hr < 10 ? '0' + hr : hr}:00`,
    a: a.get(hr) ?? emptyMetrics(),
    b: b.get(hr) ?? emptyMetrics(),
  }))
}

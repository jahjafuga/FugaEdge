// LONG VS SHORT (beat 283) -- run the existing Overview engine once per side
// and say, with earned confidence, which way the edge reads.
//
// PURE MODULE: no electron, fs, sqlite or React imports, per /ARCHITECTURE.md.
// Nothing here re-implements a statistic. The per-side numbers come from
// computeOverviewSnapshot, the same call the Overview tab makes, with the same
// filter machinery (side is one of the AND-combined OverviewFilters); the
// standard deviation is fullStats' own helper; the low-sample floor is the
// technicals SS-C:104 constant, imported by name.
//
// THE IDENTITY READ IS EARNED, NOT DECORATED. Under IDENTITY_FLOOR_N per side
// there is NO verdict at all; between the floor and IDENTITY_RELIABLE_N the
// verdict is preliminary; only when BOTH sides reach the reliable count does
// the sentence commit. A verdict needs the gap OUTSIDE both confidence bands;
// overlapping bands read balanced, whatever the raw means say. The bands are
// the plain 95% normal approximation: mean +/- Z_95 * sd / sqrt(n).

import type { TradeListRow } from '@shared/trades-types'
import type { DirectionTier, DirectionVerdict } from '@shared/direction-wording'
import { emptyFilters } from './filters'
import { computeOverviewSnapshot, type OverviewSnapshot } from './overviewSnapshot'
import { sampleStdDev } from './fullStats'
import type { EquityPoint } from './equity'
import { LOW_SAMPLE_N } from '@/core/technicals/types'

/** Below this per-side count the tab states no verdict at all. */
export const IDENTITY_FLOOR_N = 30
/** At this per-side count (both sides) the read stops calling itself thin. */
export const IDENTITY_RELIABLE_N = 100
/** Two-sided 95% z. */
export const Z_95 = 1.96

export interface SideBand {
  lo: number
  hi: number
}

export interface SideStats {
  side: 'long' | 'short'
  /** Closed, non-deleted trades on this side (the snapshot's own count). */
  n: number
  /** The FULL engine output for this side: metrics, curve, drawdown, trades. */
  snapshot: OverviewSnapshot
  /** Mean net P&L per trade; null when the side is empty. */
  meanPnl: number | null
  /** Sample std dev of per-trade net P&L; null under 2 trades (the helper's
   *  own contract). */
  sdPnl: number | null
  /** 95% confidence band around meanPnl; null when sdPnl is null. */
  band: SideBand | null
  /** 0 < n < the technicals SS-C:104 floor -- badge territory. */
  lowSample: boolean
  empty: boolean
}

export interface IdentityRead {
  tier: DirectionTier
  verdict: DirectionVerdict
  /** Trades still owed to reach IDENTITY_FLOOR_N, per side. 0 once there. */
  shortfall: { long: number; short: number }
}

/** One x-axis day with both cumulative lines. A side is 0 before its first
 *  trading day and carries its last value forward after it. */
export interface DualCurvePoint {
  date: string
  long: number
  short: number
}

export interface DirectionComparison {
  long: SideStats
  short: SideStats
  read: IdentityRead
  curve: DualCurvePoint[]
}

/** The engine, once, for one side. The side filter rides the SAME
 *  OverviewFilters path every other surface uses -- one definition of what a
 *  long trade is, in filters.ts, not two. */
export function sideStats(rows: TradeListRow[], side: 'long' | 'short'): SideStats {
  const snapshot = computeOverviewSnapshot(rows, { ...emptyFilters(), side })
  const pnls = snapshot.trades.map((t) => t.net_pnl)
  const n = pnls.length
  const meanPnl = n > 0 ? pnls.reduce((s, v) => s + v, 0) / n : null
  const sdPnl = sampleStdDev(pnls)
  const band =
    meanPnl != null && sdPnl != null
      ? {
          lo: meanPnl - (Z_95 * sdPnl) / Math.sqrt(n),
          hi: meanPnl + (Z_95 * sdPnl) / Math.sqrt(n),
        }
      : null
  return {
    side,
    n,
    snapshot,
    meanPnl,
    sdPnl,
    band,
    lowSample: n > 0 && n < LOW_SAMPLE_N,
    empty: n === 0,
  }
}

/** The earned read. Tier from the SMALLER side's count; verdict null under
 *  the floor, balanced when the bands overlap, else the higher mean. */
export function identityRead(long: SideStats, short: SideStats): IdentityRead {
  const minN = Math.min(long.n, short.n)
  const shortfall = {
    long: Math.max(0, IDENTITY_FLOOR_N - long.n),
    short: Math.max(0, IDENTITY_FLOOR_N - short.n),
  }
  if (minN < IDENTITY_FLOOR_N) {
    return { tier: 'insufficient', verdict: null, shortfall }
  }
  const tier: DirectionTier = minN >= IDENTITY_RELIABLE_N ? 'reliable' : 'preliminary'

  // Both sides are at 30+, so mean and band exist on both by construction
  // (sampleStdDev needs 2). The null checks keep the compiler honest.
  let verdict: DirectionVerdict = 'balanced'
  if (long.band && short.band && long.meanPnl != null && short.meanPnl != null) {
    const overlap = long.band.lo <= short.band.hi && short.band.lo <= long.band.hi
    if (!overlap) verdict = long.meanPnl > short.meanPnl ? 'long' : 'short'
  }
  return { tier, verdict, shortfall }
}

/** Two per-side equity curves onto one x axis: the sorted union of their
 *  dates, each side forward filled between its own points and 0 before its
 *  first -- a side that has not traded yet is flat at zero, not absent. */
export function mergeCurves(longEquity: EquityPoint[], shortEquity: EquityPoint[]): DualCurvePoint[] {
  const dates = [...new Set([...longEquity.map((p) => p.date), ...shortEquity.map((p) => p.date)])].sort()
  const out: DualCurvePoint[] = []
  let li = 0
  let si = 0
  let longCum = 0
  let shortCum = 0
  for (const date of dates) {
    while (li < longEquity.length && longEquity[li].date <= date) longCum = longEquity[li++].cumulative
    while (si < shortEquity.length && shortEquity[si].date <= date) shortCum = shortEquity[si++].cumulative
    out.push({ date, long: longCum, short: shortCum })
  }
  return out
}

/** Which direction wins a metric row (beat 287). 'higher' also covers the
 *  less-negative-wins rows (avgLoser, largestLoser): -5 > -9 and the smaller
 *  loss should lead, so the comparator is the same. 'none' rows never lead:
 *  trade count and hold time are facts without a better. */
export type MetricPolarity = 'higher' | 'lower' | 'none'

export const METRIC_POLARITY: Record<string, MetricPolarity> = {
  netPnL: 'higher',
  winRate: 'higher',
  profitFactor: 'higher',
  plRatio: 'higher',
  expectancy: 'higher',
  expectancyR: 'higher',
  avgWinner: 'higher',
  largestWinner: 'higher',
  avgMfe: 'higher',
  avgLoser: 'higher',
  largestLoser: 'higher',
  maxDrawdown: 'lower',
  avgMae: 'lower',
  trades: 'none',
  avgHold: 'none',
}

/** Leaders are EARNED: none render while either side is thin or empty. The
 *  one gate the heroes, the grid and the card all share. */
export function showLeaders(long: SideStats, short: SideStats): boolean {
  return !long.lowSample && !short.lowSample && !long.empty && !short.empty
}

/** The leading side for one metric row, or null: null polarity, null value,
 *  a tie, or an unearned sample all yield no leader. A FACT about the pair,
 *  polarity-aware; the words "better" and "edge" belong to the identity card
 *  and only when the sample has earned them. */
export function leaderFor(
  key: string,
  longValue: number | null,
  shortValue: number | null,
  long: SideStats,
  short: SideStats,
): 'long' | 'short' | null {
  if (!showLeaders(long, short)) return null
  if (longValue == null || shortValue == null) return null
  const polarity = METRIC_POLARITY[key]
  if (polarity == null || polarity === 'none') return null
  if (longValue === shortValue) return null
  if (polarity === 'higher') return longValue > shortValue ? 'long' : 'short'
  return longValue < shortValue ? 'long' : 'short'
}

export function computeDirectionComparison(rows: TradeListRow[]): DirectionComparison {
  const long = sideStats(rows, 'long')
  const short = sideStats(rows, 'short')
  return {
    long,
    short,
    read: identityRead(long, short),
    curve: mergeCurves(long.snapshot.curve, short.snapshot.curve),
  }
}

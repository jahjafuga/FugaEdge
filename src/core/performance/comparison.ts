// Period-vs-period comparison. Aligns two series by DAY INDEX (not
// calendar date) so a 22-day month can sit alongside a 20-day month with
// the day-1 bars next to each other. Also produces:
//   - the headline delta cards (Net P&L, Win Rate, Trade Count, W/L Ratio)
//   - auto-generated comparison insights ("Win rate improved by +12% vs
//     last month", "You traded 30% less but made 20% more", etc.)
//   - breakdown comparisons across catalyst / playbook / sentiment /
//     day-of-week / hour.

import type { TradeListRow } from '@shared/trades-types'
import { parseDate } from './dateUtils'
import {
  calendarDayPnLMap,
  computeDailyPnL,
  computePeriodMetrics,
} from './metrics'
import type {
  AlignedRow,
  AlignedSeries,
  BreakdownComparison,
  BreakdownDimension,
  BreakdownRow,
  ComparisonInsight,
  ComparisonResult,
  DateRange,
  DeltaDirection,
  DeltaMetric,
  PeriodMetrics,
} from './types'

// ── Alignment ────────────────────────────────────────────────────────────
//
// We align by the *index* of the calendar day inside its period (day 1 of
// A vs day 1 of B). For the daily-P&L bar chart we use every calendar day
// in the range so missing days stay visible as zero bars; for the
// cumulative line we use the same scaffolding so the lines move in
// lockstep.

function calendarDays(range: DateRange): string[] {
  const out: string[] = []
  let cur = parseDate(range.from)
  const end = parseDate(range.to).getTime()
  while (cur.getTime() <= end) {
    const y = cur.getFullYear()
    const m = cur.getMonth() + 1
    const d = cur.getDate()
    out.push(`${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`)
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return out
}

export function alignByDayOfPeriod(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
  mode: 'daily' | 'cumulative',
): AlignedSeries {
  const datesA = calendarDays(rangeA)
  const datesB = calendarDays(rangeB)
  const mapA = calendarDayPnLMap(trades, rangeA)
  const mapB = calendarDayPnLMap(trades, rangeB)
  const len = Math.max(datesA.length, datesB.length)
  const rows: AlignedRow[] = []
  let cumA = 0
  let cumB = 0
  for (let i = 0; i < len; i++) {
    const dateA = datesA[i] ?? null
    const dateB = datesB[i] ?? null
    const dayPnLA = dateA != null ? (mapA.get(dateA) ?? 0) : null
    const dayPnLB = dateB != null ? (mapB.get(dateB) ?? 0) : null
    if (dayPnLA != null) cumA += dayPnLA
    if (dayPnLB != null) cumB += dayPnLB
    const valueA =
      mode === 'daily' ? dayPnLA : dayPnLA != null ? cumA : null
    const valueB =
      mode === 'daily' ? dayPnLB : dayPnLB != null ? cumB : null
    rows.push({ dayIndex: i + 1, dateA, dateB, valueA, valueB })
  }
  return { rows, lengthA: datesA.length, lengthB: datesB.length }
}

// ── Delta primitives ─────────────────────────────────────────────────────

function direction(delta: number | null): DeltaDirection {
  if (delta == null) return 'flat'
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

interface DeltaSpec {
  metric: string
  /** higher is better when true (most metrics); false flips improvement
   *  e.g. for avg-loser magnitude or fees. */
  higherIsBetter?: boolean
}

function buildDelta(
  spec: DeltaSpec,
  valueA: number | null,
  valueB: number | null,
): DeltaMetric {
  let delta: number | null = null
  let pctChange: number | null = null
  if (valueA != null && valueB != null) {
    delta = valueA - valueB
    pctChange = valueB !== 0 ? delta / Math.abs(valueB) : null
  }
  const dir = direction(delta)
  const higherIsBetter = spec.higherIsBetter ?? true
  const isImprovement =
    dir === 'flat'
      ? false
      : higherIsBetter
        ? dir === 'up'
        : dir === 'down'
  return {
    metric: spec.metric,
    valueA,
    valueB,
    delta,
    pctChange,
    direction: dir,
    isImprovement,
  }
}

export function buildHeadlineDeltas(
  a: PeriodMetrics,
  b: PeriodMetrics,
): DeltaMetric[] {
  return [
    buildDelta({ metric: 'Net P&L' }, a.netPnL, b.netPnL),
    buildDelta({ metric: 'Win Rate' }, a.winRate, b.winRate),
    buildDelta({ metric: 'Trade Count' }, a.trades, b.trades),
    buildDelta({ metric: 'Win/Loss Ratio' }, a.winLossRatio, b.winLossRatio),
  ]
}

// ── Auto-insights ────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  const sign = n >= 0 ? '+' : '-'
  const abs = Math.abs(n)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtPctPoints(p: number): string {
  return `${p >= 0 ? '+' : ''}${(p * 100).toFixed(0)}%`
}

export function generateComparisonInsights(
  a: PeriodMetrics,
  b: PeriodMetrics,
  trades: TradeListRow[],
): ComparisonInsight[] {
  const out: ComparisonInsight[] = []

  // 1. Win rate move
  if (a.winRate != null && b.winRate != null) {
    const gap = a.winRate - b.winRate
    if (Math.abs(gap) >= 0.03) {
      out.push({
        id: 'win-rate-move',
        tone: gap > 0 ? 'positive' : 'negative',
        text: `Win rate ${gap > 0 ? 'improved' : 'dropped'} by ${fmtPctPoints(gap)} vs prior period.`,
      })
    }
  }

  // 2. Less trades but more P&L (or vice versa)
  if (a.trades > 0 && b.trades > 0) {
    const tradeDelta = (a.trades - b.trades) / b.trades
    const pnlDelta = b.netPnL !== 0 ? (a.netPnL - b.netPnL) / Math.abs(b.netPnL) : null
    if (pnlDelta != null && Math.abs(tradeDelta) >= 0.1 && Math.abs(pnlDelta) >= 0.1) {
      if (tradeDelta < 0 && pnlDelta > 0) {
        out.push({
          id: 'less-trades-more-pnl',
          tone: 'positive',
          text:
            `You traded ${fmtPctPoints(tradeDelta)} but made ${fmtPctPoints(pnlDelta)} more — efficiency up.`,
        })
      } else if (tradeDelta > 0 && pnlDelta < 0) {
        out.push({
          id: 'more-trades-less-pnl',
          tone: 'negative',
          text:
            `You traded ${fmtPctPoints(tradeDelta)} more but made ${fmtPctPoints(pnlDelta)} less — overtrading.`,
        })
      }
    }
  }

  // 3. Net P&L raw move
  const netDelta = a.netPnL - b.netPnL
  if (Math.abs(netDelta) >= 100) {
    out.push({
      id: 'net-pnl-move',
      tone: netDelta > 0 ? 'positive' : 'negative',
      text:
        netDelta > 0
          ? `Net P&L up ${fmtMoney(netDelta)} vs prior period.`
          : `Net P&L down ${fmtMoney(netDelta)} vs prior period.`,
    })
  }

  // 4. Day-of-week regression — find weekday whose P&L dropped most.
  const dowMove = mostMovedDayOfWeek(trades, a.range, b.range)
  if (dowMove && Math.abs(dowMove.delta) >= 150) {
    out.push({
      id: `dow-${dowMove.day}`,
      tone: dowMove.delta > 0 ? 'positive' : 'negative',
      text:
        `${dowMove.day} performance ${dowMove.delta > 0 ? 'jumped from' : 'dropped from'} ` +
        `${fmtMoney(dowMove.b)} to ${fmtMoney(dowMove.a)}.`,
    })
  }

  // 5. Playbook regression — biggest move per playbook
  const pbMove = mostMovedPlaybook(trades, a.range, b.range)
  if (pbMove && Math.abs(pbMove.delta) >= 150) {
    out.push({
      id: `playbook-${pbMove.name}`,
      tone: pbMove.delta > 0 ? 'positive' : 'negative',
      text:
        pbMove.delta > 0
          ? `${pbMove.name} setup is paying — ${fmtMoney(pbMove.delta)} better than prior period.`
          : `${pbMove.name} setup performance dropped, review.`,
    })
  }

  // 6. Avg winner / loser regression
  if (a.avgWinner != null && b.avgWinner != null) {
    const delta = (a.avgWinner - b.avgWinner) / Math.abs(b.avgWinner || 1)
    if (Math.abs(delta) >= 0.15) {
      out.push({
        id: 'avg-winner-move',
        tone: delta > 0 ? 'positive' : 'negative',
        text:
          delta > 0
            ? `Average winner is ${fmtPctPoints(delta)} larger — letting profits run.`
            : `Average winner is ${fmtPctPoints(delta)} smaller — cutting winners early.`,
      })
    }
  }

  return out
}

// ── Helpers for the auto-insight generator ───────────────────────────────

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayOfWeek(iso: string): string | null {
  const d = parseDate(iso)
  if (Number.isNaN(d.getTime())) return null
  return DOW_NAMES[d.getDay()] ?? null
}

interface DowMove { day: string; a: number; b: number; delta: number }

function mostMovedDayOfWeek(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
): DowMove | null {
  const aSum = new Map<string, number>()
  const bSum = new Map<string, number>()
  for (const t of trades) {
    const dow = dayOfWeek(t.date)
    if (!dow) continue
    if (t.date >= rangeA.from && t.date <= rangeA.to) {
      aSum.set(dow, (aSum.get(dow) ?? 0) + t.net_pnl)
    }
    if (t.date >= rangeB.from && t.date <= rangeB.to) {
      bSum.set(dow, (bSum.get(dow) ?? 0) + t.net_pnl)
    }
  }
  let worst: DowMove | null = null
  let worstAbs = 0
  for (const dow of DOW_NAMES) {
    const a = aSum.get(dow) ?? 0
    const b = bSum.get(dow) ?? 0
    const delta = a - b
    if (Math.abs(delta) > worstAbs) {
      worstAbs = Math.abs(delta)
      worst = { day: dow, a, b, delta }
    }
  }
  return worst
}

interface PlaybookMove { name: string; a: number; b: number; delta: number }

function mostMovedPlaybook(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
): PlaybookMove | null {
  const aSum = new Map<string, number>()
  const bSum = new Map<string, number>()
  for (const t of trades) {
    const name = t.playbook_name
    if (!name) continue
    if (t.date >= rangeA.from && t.date <= rangeA.to) {
      aSum.set(name, (aSum.get(name) ?? 0) + t.net_pnl)
    }
    if (t.date >= rangeB.from && t.date <= rangeB.to) {
      bSum.set(name, (bSum.get(name) ?? 0) + t.net_pnl)
    }
  }
  let worst: PlaybookMove | null = null
  let worstAbs = 0
  for (const name of new Set([...aSum.keys(), ...bSum.keys()])) {
    const a = aSum.get(name) ?? 0
    const b = bSum.get(name) ?? 0
    const delta = a - b
    if (Math.abs(delta) > worstAbs) {
      worstAbs = Math.abs(delta)
      worst = { name, a, b, delta }
    }
  }
  return worst
}

// ── Breakdown comparison (catalyst / playbook / sentiment / dow / hour) ──

function dimensionKey(
  t: TradeListRow,
  dim: BreakdownDimension,
  sentimentByDate: Map<string, number | null>,
): string | null {
  switch (dim) {
    case 'catalyst':
      return t.catalyst_type ?? null
    case 'playbook':
      return t.playbook_name ?? null
    case 'sentiment': {
      const v = sentimentByDate.get(t.date)
      return v == null ? null : `${v}`
    }
    case 'dow':
      return dayOfWeek(t.date)
    case 'hour': {
      const m = t.open_time.match(/[T ](\d{2}):/)
      return m ? `${parseInt(m[1], 10)}:00` : null
    }
  }
}

export function computeBreakdownComparison(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
  dim: BreakdownDimension,
  sentimentByDate: Map<string, number | null> = new Map(),
): BreakdownComparison {
  const a = new Map<string, { pnl: number; n: number }>()
  const b = new Map<string, { pnl: number; n: number }>()
  for (const t of trades) {
    const key = dimensionKey(t, dim, sentimentByDate)
    if (!key) continue
    if (t.date >= rangeA.from && t.date <= rangeA.to) {
      const cur = a.get(key) ?? { pnl: 0, n: 0 }
      cur.pnl += t.net_pnl
      cur.n += 1
      a.set(key, cur)
    }
    if (t.date >= rangeB.from && t.date <= rangeB.to) {
      const cur = b.get(key) ?? { pnl: 0, n: 0 }
      cur.pnl += t.net_pnl
      cur.n += 1
      b.set(key, cur)
    }
  }
  const keys = new Set([...a.keys(), ...b.keys()])
  const rows: BreakdownRow[] = []
  for (const key of keys) {
    const av = a.get(key) ?? { pnl: 0, n: 0 }
    const bv = b.get(key) ?? { pnl: 0, n: 0 }
    rows.push({
      key,
      netPnLA: av.pnl,
      tradesA: av.n,
      netPnLB: bv.pnl,
      tradesB: bv.n,
    })
  }
  // Hour rows sort numerically; the rest sort by combined trade count desc.
  if (dim === 'hour') {
    rows.sort((x, y) => parseInt(x.key, 10) - parseInt(y.key, 10))
  } else if (dim === 'dow') {
    rows.sort((x, y) => DOW_NAMES.indexOf(x.key) - DOW_NAMES.indexOf(y.key))
  } else {
    rows.sort((x, y) => y.tradesA + y.tradesB - (x.tradesA + x.tradesB))
  }
  return { dimension: dim, rows }
}

// ── Full top-level comparison ────────────────────────────────────────────

export function computePeriodComparison(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
): ComparisonResult {
  const a = computePeriodMetrics(trades, rangeA)
  const b = computePeriodMetrics(trades, rangeB)
  return {
    periodA: a,
    periodB: b,
    headline: buildHeadlineDeltas(a, b),
    dailyPnL: alignByDayOfPeriod(trades, rangeA, rangeB, 'daily'),
    cumulativePnL: alignByDayOfPeriod(trades, rangeA, rangeB, 'cumulative'),
    insights: generateComparisonInsights(a, b, trades),
  }
}

// Re-export so the renderer can re-pull daily series with the public type.
export { computeDailyPnL }

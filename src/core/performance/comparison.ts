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
import { utcToEasternParts } from '@/lib/format'
import {
  calendarDayPnLMap,
  computeDailyPnL,
  computePeriodMetrics,
  tradesInRange,
} from './metrics'
import { computeFullStats } from './fullStats'
import { buildEquityCurve, computeDrawdown } from './equity'
import { relativeChange } from './ratio'
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

// Below this prior-net / avg-winner base ($), a "% change vs it" is noise (see
// relativeChange). Rule 2's absolute-swing fallback uses the same $ as its floor.
const INSIGHT_BASE_FLOOR = 50

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

  // 2. Less trades but more P&L (or vice versa). The "% more/less" framing is
  //    only honest when the PRIOR net is a healthy positive base — a "% more"
  //    against a near-zero or NEGATIVE prior net is nonsense (the old +547%), so
  //    fall back to the absolute swing there.
  if (a.trades > 0 && b.trades > 0) {
    const tradeDelta = (a.trades - b.trades) / b.trades
    const pnlDelta = relativeChange(a.netPnL, b.netPnL, { baseFloor: INSIGHT_BASE_FLOOR })
    const pnlUp = a.netPnL > b.netPnL
    const pnlNotable =
      pnlDelta != null && b.netPnL > 0
        ? Math.abs(pnlDelta) >= 0.1
        : Math.abs(a.netPnL - b.netPnL) >= INSIGHT_BASE_FLOOR
    if (Math.abs(tradeDelta) >= 0.1 && pnlNotable) {
      if (tradeDelta < 0 && pnlUp) {
        out.push({
          id: 'less-trades-more-pnl',
          tone: 'positive',
          text:
            pnlDelta != null && b.netPnL > 0
              ? `You traded ${fmtPctPoints(tradeDelta)} but made ${fmtPctPoints(pnlDelta)} more — efficiency up.`
              : `You traded ${fmtPctPoints(tradeDelta)} and net P&L swung from ${fmtMoney(b.netPnL)} to ${fmtMoney(a.netPnL)} — efficiency up.`,
        })
      } else if (tradeDelta > 0 && !pnlUp) {
        out.push({
          id: 'more-trades-less-pnl',
          tone: 'negative',
          text:
            pnlDelta != null && b.netPnL > 0
              ? `You traded ${fmtPctPoints(tradeDelta)} more but made ${fmtPctPoints(pnlDelta)} less — overtrading.`
              : `You traded ${fmtPctPoints(tradeDelta)} more and net P&L swung from ${fmtMoney(b.netPnL)} to ${fmtMoney(a.netPnL)} — overtrading.`,
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

  // 6. Avg winner / loser regression — suppressed when the prior avg winner is
  //    too small a base for a % to mean anything (the old +95% off a few dollars).
  if (a.avgWinner != null && b.avgWinner != null) {
    const delta = relativeChange(a.avgWinner, b.avgWinner, { baseFloor: INSIGHT_BASE_FLOOR })
    if (delta != null && Math.abs(delta) >= 0.15) {
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

// ── Breakdown comparison (catalyst / playbook / sentiment / dow / hour / price) ──

// Price-at-entry buckets — MIRRORS electron/reports/get.ts PRICE_BUCKETS /
// priceBucketKey / entryPrice EXACTLY (same boundaries + labels) so the
// single-period (Analytics) and per-period (Compare) price breakdowns agree on
// which bucket a trade lands in. Replicated, not shared, because get.ts is
// main-process; a future extract-to-a-shared-pure-module would DRY the two.
const PRICE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< $2', min: 0, max: 2 },
  { key: '$2–5', min: 2, max: 5 },
  { key: '$5–10', min: 5, max: 10 },
  { key: '$10–15', min: 10, max: 15 },
  { key: '$15–20', min: 15, max: 20 },
  { key: '> $20', min: 20, max: Number.POSITIVE_INFINITY },
]
const PRICE_ORDER: Record<string, number> = Object.fromEntries(
  PRICE_BUCKETS.map((b, i) => [b.key, i]),
)

// Entry price = the avg of the side opened on (buy for longs, sell for shorts),
// with a fallback — mirrors get.ts entryPrice.
function entryPrice(t: TradeListRow): number {
  if (t.side === 'short') return t.avg_sell_price || t.avg_buy_price
  return t.avg_buy_price || t.avg_sell_price
}

function priceBucketLabel(price: number): string | null {
  for (const b of PRICE_BUCKETS) {
    if (price >= b.min && price < b.max) return b.key
  }
  return null
}

// Free-float buckets — MIRROR electron/reports/get.ts FLOAT_BUCKETS / floatBucket
// EXACTLY (same boundaries + en-dash labels, RAW share counts) so the single-
// period (Analytics) and per-period (Compare) float breakdowns agree. float_shares
// is read directly off the trade (a stored column); null = no float data = null
// key = dropped and counted in notShown.
const FLOAT_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< 1M', min: 0, max: 1_000_000 },
  { key: '1–2.5M', min: 1_000_000, max: 2_500_000 },
  { key: '2.5–5M', min: 2_500_000, max: 5_000_000 },
  { key: '5–10M', min: 5_000_000, max: 10_000_000 },
  { key: '10–20M', min: 10_000_000, max: 20_000_000 },
  { key: '20–50M', min: 20_000_000, max: 50_000_000 },
  { key: '> 50M', min: 50_000_000, max: Number.POSITIVE_INFINITY },
]
const FLOAT_ORDER: Record<string, number> = Object.fromEntries(
  FLOAT_BUCKETS.map((b, i) => [b.key, i]),
)
function floatBucketLabel(shares: number): string | null {
  for (const b of FLOAT_BUCKETS) {
    if (shares >= b.min && shares < b.max) return b.key
  }
  return null
}

// Relative-volume buckets — MIRROR electron/reports/get.ts RVOL_BUCKETS / rvolBucket
// EXACTLY (same boundaries + en-dash/× labels, RAW multiples) so the single-period
// (Analytics) and per-period (Compare) RVOL breakdowns agree. rvol is read directly
// off the trade (a stored column); null = no rvol data = null key = dropped and
// counted in notShown.
const RVOL_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '0–2×', min: 0, max: 2 },
  { key: '2–5×', min: 2, max: 5 },
  { key: '5–10×', min: 5, max: 10 },
  { key: '10×+', min: 10, max: Number.POSITIVE_INFINITY },
]
const RVOL_ORDER: Record<string, number> = Object.fromEntries(
  RVOL_BUCKETS.map((b, i) => [b.key, i]),
)
function rvolBucketLabel(rvol: number): string | null {
  for (const b of RVOL_BUCKETS) {
    if (rvol >= b.min && rvol < b.max) return b.key
  }
  return null
}

// At-entry daily % change vs prior close — a SIGNED percentage (+50% stored as
// 50, gapped-down negative). No get.ts precedent; buckets designed fresh for the
// real distribution (extreme up-gappers, fat tail past +900%). Exhaustive over
// all reals via ±Infinity so a value is never left unbucketed — any negative
// lands in '< 0%'. daily_change_pct is read directly off the trade (a stored
// column); null = no gap data = null key = dropped and counted in notShown.
const GAP_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< 0%', min: Number.NEGATIVE_INFINITY, max: 0 },
  { key: '0–50%', min: 0, max: 50 },
  { key: '50–100%', min: 50, max: 100 },
  { key: '100–200%', min: 100, max: 200 },
  { key: '200–500%', min: 200, max: 500 },
  { key: '500%+', min: 500, max: Number.POSITIVE_INFINITY },
]
const GAP_ORDER: Record<string, number> = Object.fromEntries(
  GAP_BUCKETS.map((b, i) => [b.key, i]),
)
function gapBucketLabel(pct: number): string | null {
  for (const b of GAP_BUCKETS) {
    if (pct >= b.min && pct < b.max) return b.key
  }
  return null
}

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
      // open_time is true UTC (Day 8.5 Commit B) — bucket by Eastern hour.
      const p = utcToEasternParts(t.open_time)
      return p ? `${p.hour}:00` : null
    }
    case 'price':
      return priceBucketLabel(entryPrice(t))
    case 'float':
      return t.float_shares == null ? null : floatBucketLabel(t.float_shares)
    case 'rvol':
      return t.rvol == null ? null : rvolBucketLabel(t.rvol)
    case 'gap':
      return t.daily_change_pct == null ? null : gapBucketLabel(t.daily_change_pct)
    case 'region':
      return t.region ?? 'Unknown'
    case 'country':
      return t.country ?? null  // unknowns filtered upstream by the !key check
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
  // In-scope trades (rangeA ∪ rangeB) whose dimension key is null are dropped
  // from the rows; count them HERE, at the drop site, so a coverage-gated card
  // can disclose the gap honestly (e.g. "N without float data") instead of
  // silently showing a short total. Out-of-scope trades are not counted.
  let notShown = 0
  for (const t of trades) {
    const inA = t.date >= rangeA.from && t.date <= rangeA.to
    const inB = t.date >= rangeB.from && t.date <= rangeB.to
    if (!inA && !inB) continue
    const key = dimensionKey(t, dim, sentimentByDate)
    if (!key) {
      notShown += 1
      continue
    }
    if (inA) {
      const cur = a.get(key) ?? { pnl: 0, n: 0 }
      cur.pnl += t.net_pnl
      cur.n += 1
      a.set(key, cur)
    }
    if (inB) {
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
  // Hour numerically; price cheap->expensive by bucket order; dow by weekday;
  // the rest by combined trade count desc.
  if (dim === 'hour') {
    rows.sort((x, y) => parseInt(x.key, 10) - parseInt(y.key, 10))
  } else if (dim === 'price') {
    rows.sort((x, y) => (PRICE_ORDER[x.key] ?? 99) - (PRICE_ORDER[y.key] ?? 99))
  } else if (dim === 'float') {
    rows.sort((x, y) => (FLOAT_ORDER[x.key] ?? 99) - (FLOAT_ORDER[y.key] ?? 99))
  } else if (dim === 'rvol') {
    rows.sort((x, y) => (RVOL_ORDER[x.key] ?? 99) - (RVOL_ORDER[y.key] ?? 99))
  } else if (dim === 'gap') {
    rows.sort((x, y) => (GAP_ORDER[x.key] ?? 99) - (GAP_ORDER[y.key] ?? 99))
  } else if (dim === 'dow') {
    rows.sort((x, y) => DOW_NAMES.indexOf(x.key) - DOW_NAMES.indexOf(y.key))
  } else {
    rows.sort((x, y) => y.tradesA + y.tradesB - (x.tradesA + x.tradesB))
  }
  return { dimension: dim, rows, notShown }
}

// ── Full top-level comparison ────────────────────────────────────────────

export function computePeriodComparison(
  trades: TradeListRow[],
  rangeA: DateRange,
  rangeB: DateRange,
): ComparisonResult {
  const a = computePeriodMetrics(trades, rangeA)
  const b = computePeriodMetrics(trades, rangeB)

  // Wired tier: three stats already produced by the pure full-stats / drawdown
  // helpers but absent from PeriodMetrics. Slice with the SAME tradesInRange
  // computePeriodMetrics uses so the numbers can't diverge, then attach. Done
  // HERE (not inside computePeriodMetrics) so its CalendarCompareStrip caller is
  // not taxed with the extra full-stats + drawdown pass. No new math.
  const rowsA = tradesInRange(trades, rangeA)
  const rowsB = tradesInRange(trades, rangeB)
  const fsA = computeFullStats(rowsA)
  const fsB = computeFullStats(rowsB)
  const ddA = computeDrawdown(buildEquityCurve(rowsA))
  const ddB = computeDrawdown(buildEquityCurve(rowsB))
  const periodA: PeriodMetrics = {
    ...a,
    avgDailyVolume: fsA.avg_daily_volume,
    avgHoldScratch: fsA.avg_hold_seconds_scratches,
    maxDrawdown: ddA?.amount ?? null,
    avgPerSharePnl: fsA.avg_per_share_pnl,
    avgPerShareGain: fsA.avg_per_share_gain,
    avgPerShareLoss: fsA.avg_per_share_loss,
    maxPerShareWin: fsA.max_per_share_win,
    maxPerShareLoss: fsA.max_per_share_loss,
    totalSharesTraded: fsA.total_shares_traded,
    apptPct: fsA.appt_pct,
    avgWinPct: fsA.avg_win_pct,
    avgLossPct: fsA.avg_loss_pct,
    maxWinPct: fsA.max_win_pct,
    maxLossPct: fsA.max_loss_pct,
    avgShareSize: fsA.avg_share_size,
    avgPositionSize: fsA.avg_position_size,
  }
  const periodB: PeriodMetrics = {
    ...b,
    avgDailyVolume: fsB.avg_daily_volume,
    avgHoldScratch: fsB.avg_hold_seconds_scratches,
    maxDrawdown: ddB?.amount ?? null,
    avgPerSharePnl: fsB.avg_per_share_pnl,
    avgPerShareGain: fsB.avg_per_share_gain,
    avgPerShareLoss: fsB.avg_per_share_loss,
    maxPerShareWin: fsB.max_per_share_win,
    maxPerShareLoss: fsB.max_per_share_loss,
    totalSharesTraded: fsB.total_shares_traded,
    apptPct: fsB.appt_pct,
    avgWinPct: fsB.avg_win_pct,
    avgLossPct: fsB.avg_loss_pct,
    maxWinPct: fsB.max_win_pct,
    maxLossPct: fsB.max_loss_pct,
    avgShareSize: fsB.avg_share_size,
    avgPositionSize: fsB.avg_position_size,
  }

  return {
    periodA,
    periodB,
    headline: buildHeadlineDeltas(a, b),
    dailyPnL: alignByDayOfPeriod(trades, rangeA, rangeB, 'daily'),
    cumulativePnL: alignByDayOfPeriod(trades, rangeA, rangeB, 'cumulative'),
    insights: generateComparisonInsights(a, b, trades),
  }
}

// Re-export so the renderer can re-pull daily series with the public type.
export { computeDailyPnL }

// v0.2.7 Feature 1 — the Analytics Overview snapshot, computed from ONE filtered set.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React imports.
//
// WHY THIS EXISTS. The page ran two sources side by side. The equity curve, the
// drawdown card, best/worst day and the tiles all rode an UNFILTERED IPC payload,
// while a separately-filtered trade list drove only the daily breakdown below. A
// filter the user set moved half the page, and the chart could describe a different
// book from the tile beside it.
//
// This composes what already exists — applyFilters, buildEquityCurve, computeDrawdown,
// computePeriodMetrics — over a single filtered list, so agreement is structural
// rather than something the widgets have to remember to honour. In particular the
// curve's final cumulative IS the net figure the tile shows: same trades, one pass.
//
// It ADDS no maths. Every number here already had one implementation; this is the
// composition point, not a fifth copy.

import { applyFilters } from './filters'
import { buildEquityCurve, computeDrawdown, type EquityPoint, type DrawdownInfo } from './equity'
import { computePeriodMetrics } from './metrics'
import type { PeriodMetrics, DateRange, OverviewFilters } from './types'
import type { TradeListRow } from '@shared/trades-types'

export interface OverviewSnapshot {
  /** The filtered trades every field below is derived from. */
  trades: TradeListRow[]
  curve: EquityPoint[]
  drawdown: DrawdownInfo | null
  /** The twelve-tile block. Ratios are null on an empty or undecided set — never
   *  NaN and never Infinity, so a tile renders an em dash rather than nonsense. */
  metrics: PeriodMetrics
}

/** The widest range that covers the filtered set. computePeriodMetrics scopes by
 *  range, so with no explicit range we hand it one spanning the data rather than a
 *  sentinel — an empty set yields an empty span and every count falls to zero. */
function spanOf(trades: TradeListRow[]): DateRange {
  if (trades.length === 0) return { from: '', to: '' }
  let from = trades[0].date
  let to = trades[0].date
  for (const t of trades) {
    if (t.date < from) from = t.date
    if (t.date > to) to = t.date
  }
  return { from, to }
}

export function computeOverviewSnapshot(
  trades: TradeListRow[],
  filters: OverviewFilters,
): OverviewSnapshot {
  const filtered = applyFilters(trades, filters)
  const curve = buildEquityCurve(filtered)
  return {
    trades: filtered,
    curve,
    // Drawdown rides the SAME curve, so its peak and trough can only ever fall
    // inside the active filter — the mixed-source bug cannot survive in that card.
    drawdown: computeDrawdown(curve),
    metrics: computePeriodMetrics(filtered, filters.range ?? spanOf(filtered)),
  }
}

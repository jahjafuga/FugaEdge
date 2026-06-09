// v0.2.4 Session 4 — pure Header Strip aggregation (spec §B Section 1 +
// §A9 discipline / full-alignment). Computes the four header-card stats
// from the bulk reader's TradeWithTechnicalsRow[] for the toggled timeframe.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

export type Timeframe = '1m' | '5m'

/**
 * Stats for a single Header Strip card.
 *
 * - percent: subset.length / denominator * 100, rounded to 1 decimal,
 *   or null when denominator === 0.
 * - winRate: count(net_pnl > 0) / subset.length, as a fraction (0..1),
 *   or null when subset.length < 5 (spec §C:104 suppression). Breakeven
 *   ($0 net) counts as a loss (spec §A7).
 * - netPnl: sum of net_pnl across the subset (always computed).
 * - n: count of trades in the subset (the percent numerator).
 */
export interface CardStats {
  percent: number | null
  winRate: number | null
  netPnl: number
  n: number
}

/**
 * Aggregated stats for the four Header Strip cards.
 *
 * Denominator across all four cards = trades that pass the data gate
 * (technicals !== null && technicals.data_complete === true). Trades
 * failing the gate are counted in `excluded` for the §C:103 chip and
 * contribute to no percent or subset stat.
 *
 * - macdPositive: toggled-timeframe macd_positive === true
 * - aboveVwap: toggled-timeframe vwap_dist_pct > 0
 * - aboveEma9: toggled-timeframe ema9_dist_pct > 0
 * - fullAlignment: ALL THREE predicates (spec §A9 discipline score)
 */
export interface HeaderStripStats {
  denominator: number
  excluded: number
  macdPositive: CardStats
  aboveVwap: CardStats
  aboveEma9: CardStats
  fullAlignment: CardStats
}

export function computeHeaderStrip(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): HeaderStripStats {
  let denominator = 0
  let excluded = 0

  // Per-subset accumulators: count, net P&L sum, and winner count.
  interface Acc {
    n: number
    netPnl: number
    wins: number
  }
  const macd: Acc = { n: 0, netPnl: 0, wins: 0 }
  const vwap: Acc = { n: 0, netPnl: 0, wins: 0 }
  const ema9: Acc = { n: 0, netPnl: 0, wins: 0 }
  const full: Acc = { n: 0, netPnl: 0, wins: 0 }

  for (const row of rows) {
    const t = row.technicals
    // Data gate: only complete snapshots count toward the denominator;
    // everything else is excluded (feeds the §C:103 chip).
    if (t === null || !t.data_complete) {
      excluded += 1
      continue
    }
    denominator += 1

    const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
    const macdPos = snap.macd_positive === true
    const aboveVwap = snap.vwap_dist_pct !== null && snap.vwap_dist_pct > 0
    const aboveEma9 = snap.ema9_dist_pct !== null && snap.ema9_dist_pct > 0

    // Breakeven ($0 net) is a loss per §A7, so a winner is strictly > 0.
    const isWin = row.net_pnl > 0
    const add = (a: Acc) => {
      a.n += 1
      a.netPnl += row.net_pnl
      if (isWin) a.wins += 1
    }
    if (macdPos) add(macd)
    if (aboveVwap) add(vwap)
    if (aboveEma9) add(ema9)
    if (macdPos && aboveVwap && aboveEma9) add(full)
  }

  const toCard = (a: Acc): CardStats => ({
    // 1-decimal rounding; null when there's no denominator to divide by.
    percent: denominator === 0 ? null : Math.round((a.n / denominator) * 1000) / 10,
    // Suppressed below n=5 (§C:104) — too small a sample to be meaningful.
    winRate: a.n < 5 ? null : a.wins / a.n,
    netPnl: a.netPnl,
    n: a.n,
  })

  return {
    denominator,
    excluded,
    macdPositive: toCard(macd),
    aboveVwap: toCard(vwap),
    aboveEma9: toCard(ema9),
    fullAlignment: toCard(full),
  }
}

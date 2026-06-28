// v0.2.4 Session 4 — pure Header Strip aggregation (spec §B Section 1 +
// §A9 discipline / full-alignment). Computes the four header-card stats
// from the bulk reader's TradeWithTechnicalsRow[] for the toggled timeframe.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { isFullyAligned, isPreMarketEntry } from './alignment'

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
 * `denominator` = trades that pass the data gate (technicals !== null &&
 * technicals.data_complete === true). It is the percentage denominator for the
 * MACD, 9EMA, and discipline cards. Trades failing the gate are counted in
 * `excluded` for the §C:103 chip and contribute to no percent or subset stat.
 *
 * `vwapDenominator` = the subset of those data-complete trades whose toggled-
 * timeframe vwap_dist_pct is non-null. It is the percentage denominator for the
 * VWAP card ONLY: vwap_dist_pct is legitimately null on a data_complete row (a
 * pre-session entry has no regular-session VWAP yet), so counting those nulls in
 * the VWAP card's denominator would drag the "above VWAP" % down. Mirrors
 * vwapBuckets.ts, which peels null-VWAP trades into its own coverage tier.
 *
 * - macdPositive: toggled-timeframe macd_positive === true        (÷ denominator)
 * - aboveVwap: toggled-timeframe vwap_dist_pct > 0                (÷ vwapDenominator)
 * - aboveEma9: toggled-timeframe ema9_dist_pct > 0                (÷ denominator)
 * - fullAlignment: the shared isFullyAligned predicate (§A9; pre-market entries
 *   drop the N/A session-VWAP condition — judged on MACD + 9EMA only) (÷ denominator)
 */
export interface HeaderStripStats {
  denominator: number
  /** VWAP-card percentage denominator: data-complete trades with a non-null
   *  vwap_dist_pct (pre-session entries carry a null RTH VWAP). See doc above. */
  vwapDenominator: number
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
  let vwapDenominator = 0
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

    // vwap_dist_pct is legitimately null on a data_complete row when the entry
    // was pre-session (no regular-session VWAP yet). Those must NOT pad the VWAP
    // card's denominator — count only non-null VWAP here, mirroring vwapBuckets.ts.
    if (snap.vwap_dist_pct !== null) vwapDenominator += 1

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
    if (isFullyAligned(snap.macd_positive, snap.vwap_dist_pct, snap.ema9_dist_pct, isPreMarketEntry(row.open_time))) {
      add(full)
    }
  }

  // `denom` is the per-card percentage denominator: the shared data-complete
  // count for MACD / 9EMA / discipline, but the non-null-VWAP count for the
  // VWAP card (see HeaderStripStats doc — null VWAP must not deflate it).
  const toCard = (a: Acc, denom: number): CardStats => ({
    // 1-decimal rounding; null when there's no denominator to divide by.
    percent: denom === 0 ? null : Math.round((a.n / denom) * 1000) / 10,
    // Suppressed below n=5 (§C:104) — too small a sample to be meaningful.
    winRate: a.n < 5 ? null : a.wins / a.n,
    netPnl: a.netPnl,
    n: a.n,
  })

  return {
    denominator,
    vwapDenominator,
    excluded,
    macdPositive: toCard(macd, denominator),
    aboveVwap: toCard(vwap, vwapDenominator),
    aboveEma9: toCard(ema9, denominator),
    fullAlignment: toCard(full, denominator),
  }
}

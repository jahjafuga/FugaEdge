// Beat 4a — the single Convention-A outcome-stats helper. Pure: no electron,
// no DB, no React imports (importable by both the renderer — tiers.ts,
// metrics.ts — and the main process — electron/playbook/repo.ts — via @/core).
//
// "Convention A" = scratch-EXCLUDED: a trade is a win / loss / scratch per
// classifyOutcome (|net_pnl| ≤ SCRATCH_EPSILON ⇒ scratch), and win_rate divides
// by DECIDED trades (winners + losers), not the total. Scratches count toward
// `scratches` and `net_pnl` only.
//
// This replaces three byte-identical inline copies (tiers.ts:58-67,
// electron/playbook/repo.ts:136-147, metrics.ts:188-193) — extracted verbatim,
// so every surface's numbers are unchanged. The technicals buckets
// (vwapBuckets / macdBuckets / emaBuckets) are Convention B (winners/n,
// breakeven=loss, n<5 suppression) and deliberately NOT unified here.

import { classifyOutcome } from '@/core/classify/outcome'

export interface OutcomeStats {
  winners: number
  losers: number
  scratches: number
  /** Sum of net_pnl across all trades (winners, losers, AND scratches). */
  net_pnl: number
  /** winners / (winners + losers); null when no decided trades. */
  win_rate: number | null
  /** WR·avgWinner − (1−WR)·|avgLoser|; null unless win_rate, avg_winner, and
   *  avg_loser are all non-null. */
  expectancy: number | null
  /** winnersSum / |losersSum|; null when there are no losers (so 0 winners +
   *  ≥1 loser yields 0, not null). */
  profit_factor: number | null
  avg_winner: number | null
  avg_loser: number | null
  /** avg_winner / |avg_loser| — the P:L ratio (avg win vs avg loss), DISTINCT
   *  from profit_factor (Σ wins / |Σ losses|). Null when there are no winners,
   *  no losers, or avg_loser is 0. Render via formatPnlRatio. */
  pnl_ratio: number | null
}

/** The P:L-ratio derive — avg_winner / |avg_loser|. Exported so a caller that
 *  already holds the two averages shares ONE definition with computeOutcomeStats
 *  (no second copy). Null when either average is null or avg_loser is 0 (no
 *  divide-by-zero). Distinct from profit_factor. */
export function pnlRatioFromAvgs(
  avgWinner: number | null,
  avgLoser: number | null,
): number | null {
  return avgWinner != null && avgLoser != null && avgLoser !== 0
    ? avgWinner / Math.abs(avgLoser)
    : null
}

/** Compute the Convention-A outcome stats for a set of trades. Only `net_pnl`
 *  is read, so callers can pass any row shape that carries it. */
export function computeOutcomeStats(
  trades: readonly { net_pnl: number }[],
): OutcomeStats {
  let net = 0
  let winners = 0
  let losers = 0
  let scratches = 0
  let winnersSum = 0
  let losersSum = 0

  for (const t of trades) {
    net += t.net_pnl
    const outcome = classifyOutcome(t.net_pnl)
    if (outcome === 'win') {
      winners += 1
      winnersSum += t.net_pnl
    } else if (outcome === 'loss') {
      losers += 1
      losersSum += t.net_pnl
    } else {
      scratches += 1
    }
  }

  const decided = winners + losers
  const win_rate = decided > 0 ? winners / decided : null
  const avg_winner = winners > 0 ? winnersSum / winners : null
  const avg_loser = losers > 0 ? losersSum / losers : null
  const expectancy =
    win_rate != null && avg_winner != null && avg_loser != null
      ? win_rate * avg_winner - (1 - win_rate) * Math.abs(avg_loser)
      : null
  const profit_factor = losers > 0 ? winnersSum / Math.abs(losersSum) : null

  return {
    winners,
    losers,
    scratches,
    net_pnl: net,
    win_rate,
    expectancy,
    profit_factor,
    avg_winner,
    avg_loser,
    pnl_ratio: pnlRatioFromAvgs(avg_winner, avg_loser),
  }
}

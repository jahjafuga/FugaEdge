// Pure aggregator for the Tier Performance analytics card. Web-portable
// per ARCHITECTURE.md: no electron/sqlite/http imports.
//
// Groups trades by their playbook's tier (joined into TradeListRow as
// `playbook_tier` by the trades-list IPC). Trades without a playbook tier
// are skipped — the card is about whether tier *discipline* pays, and an
// untagged trade has no tier claim.

import type { TradeListRow } from '@shared/trades-types'
import { PLAYBOOK_TIERS, type PlaybookTier } from '@shared/playbook-types'
import { computeOutcomeStats } from '@/core/stats/outcomeStats'

export interface TierPerformanceRow {
  tier: PlaybookTier
  trades: number
  winners: number
  losers: number
  scratches: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  win_rate: number | null
  /** Mean per-decided-trade payoff: WR·avgWinner − (1−WR)·|avgLoser|.
   *  Null when win-rate or avg-loser can't be computed. Expressed in $. */
  expectancy: number | null
  profit_factor: number | null
  avg_winner: number | null
  avg_loser: number | null
}

// Per-tier row from the bucket's trades. The Convention-A stats (win rate,
// expectancy, profit factor, avg winner/loser, win/loss/scratch counts, net)
// come from the shared computeOutcomeStats helper; gross_pnl + total_fees are
// summed here (outside the helper's scope). Output is byte-identical to the
// former inline accumulator.
function bucketToRow(
  tier: PlaybookTier,
  trades: readonly TradeListRow[],
): TierPerformanceRow {
  const s = computeOutcomeStats(trades)
  let gross_pnl = 0
  let total_fees = 0
  for (const t of trades) {
    gross_pnl += t.gross_pnl
    total_fees += t.total_fees
  }
  return {
    tier,
    trades: trades.length,
    winners: s.winners,
    losers: s.losers,
    scratches: s.scratches,
    net_pnl: s.net_pnl,
    gross_pnl,
    total_fees,
    win_rate: s.win_rate,
    expectancy: s.expectancy,
    profit_factor: s.profit_factor,
    avg_winner: s.avg_winner,
    avg_loser: s.avg_loser,
  }
}

/** Aggregate per-tier stats from a trade list. Returns rows ordered
 *  A+ → A → B → C, including only tiers that have at least one trade. */
export function aggregateTierPerformance(
  trades: readonly TradeListRow[],
): TierPerformanceRow[] {
  const byTier = new Map<PlaybookTier, TradeListRow[]>()

  for (const t of trades) {
    if (!t.playbook_tier) continue
    const arr = byTier.get(t.playbook_tier)
    if (arr) {
      arr.push(t)
    } else {
      byTier.set(t.playbook_tier, [t])
    }
  }

  const rows: TierPerformanceRow[] = []
  for (const tier of PLAYBOOK_TIERS) {
    const bucketTrades = byTier.get(tier)
    if (bucketTrades) rows.push(bucketToRow(tier, bucketTrades))
  }
  return rows
}

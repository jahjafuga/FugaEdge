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
  /** avg_winner / |avg_loser| — the P:L ratio, DISTINCT from profit_factor
   *  (Σ wins / |Σ losses|). Null when no winners, no losers, or avg_loser is 0. */
  pnl_ratio: number | null
  /** Distinct playbooks tagged in this tier — the nested expansion's row count. */
  setups: number
  /** Per-playbook breakdown within this tier, ordered net P&L desc. The rows'
   *  net_pnl sums back to this row's net_pnl (the reconciliation invariant). */
  playbooks: PlaybookPerfRow[]
}

/** One playbook's row inside a tier's nested expansion. Stats come from the same
 *  computeOutcomeStats helper as the tier row, so the numbers reconcile. */
export interface PlaybookPerfRow {
  playbook_id: number
  name: string
  trades: number
  winners: number
  losers: number
  scratches: number
  net_pnl: number
  win_rate: number | null
  expectancy: number | null
  pnl_ratio: number | null
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
  const playbooks = aggregatePlaybooksInTier(trades)
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
    pnl_ratio: s.pnl_ratio,
    setups: playbooks.length,
    playbooks,
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

/** Group a single tier's trades by their primary playbook — one row per distinct
 *  playbook (keyed by playbook_id). Trades with no playbook_id are skipped, the
 *  same way aggregateTierPerformance skips null-tier trades; in practice a tagged
 *  tier implies a playbook, so nothing is dropped and the rows' net_pnl sums back
 *  to the tier's net_pnl. Stats come from the same computeOutcomeStats helper the
 *  tier rows use. Sorted net P&L desc (ties: trade count desc, then name asc). */
export function aggregatePlaybooksInTier(
  trades: readonly TradeListRow[],
): PlaybookPerfRow[] {
  const byPlaybook = new Map<number, { name: string; trades: TradeListRow[] }>()

  for (const t of trades) {
    if (t.playbook_id == null) continue
    const entry = byPlaybook.get(t.playbook_id)
    if (entry) {
      entry.trades.push(t)
    } else {
      byPlaybook.set(t.playbook_id, {
        name: t.playbook_name ?? `Playbook ${t.playbook_id}`,
        trades: [t],
      })
    }
  }

  const rows: PlaybookPerfRow[] = []
  for (const [playbook_id, { name, trades: pbTrades }] of byPlaybook) {
    const s = computeOutcomeStats(pbTrades)
    rows.push({
      playbook_id,
      name,
      trades: pbTrades.length,
      winners: s.winners,
      losers: s.losers,
      scratches: s.scratches,
      net_pnl: s.net_pnl,
      win_rate: s.win_rate,
      expectancy: s.expectancy,
      pnl_ratio: s.pnl_ratio,
    })
  }

  rows.sort(
    (a, b) =>
      b.net_pnl - a.net_pnl || b.trades - a.trades || a.name.localeCompare(b.name),
  )
  return rows
}

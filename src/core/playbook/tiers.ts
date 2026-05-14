// Pure aggregator for the Tier Performance analytics card. Web-portable
// per ARCHITECTURE.md: no electron/sqlite/http imports.
//
// Groups trades by their playbook's tier (joined into TradeListRow as
// `playbook_tier` by the trades-list IPC). Trades without a playbook tier
// are skipped — the card is about whether tier *discipline* pays, and an
// untagged trade has no tier claim.

import type { TradeListRow } from '@shared/trades-types'
import { PLAYBOOK_TIERS, type PlaybookTier } from '@shared/playbook-types'

// A small bound between "scratch" and a counted win/loss. Matches the
// SCRATCH_THRESHOLD constant used elsewhere in the codebase (playbook repo
// + performance/comparison). Keeps the tier card's numbers consistent
// with the Setup Library and the Reports breakdowns.
const SCRATCH_THRESHOLD = 2

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

interface Bucket {
  trades: number
  winners: number
  losers: number
  scratches: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  winners_sum: number
  losers_sum: number
}

function emptyBucket(): Bucket {
  return {
    trades: 0,
    winners: 0,
    losers: 0,
    scratches: 0,
    net_pnl: 0,
    gross_pnl: 0,
    total_fees: 0,
    winners_sum: 0,
    losers_sum: 0,
  }
}

function bucketToRow(tier: PlaybookTier, b: Bucket): TierPerformanceRow {
  const decided = b.winners + b.losers
  const win_rate = decided > 0 ? b.winners / decided : null
  const avg_winner = b.winners > 0 ? b.winners_sum / b.winners : null
  const avg_loser = b.losers > 0 ? b.losers_sum / b.losers : null
  const expectancy =
    win_rate != null && avg_winner != null && avg_loser != null
      ? win_rate * avg_winner - (1 - win_rate) * Math.abs(avg_loser)
      : null
  const profit_factor =
    b.losers > 0 ? b.winners_sum / Math.abs(b.losers_sum) : null
  return {
    tier,
    trades: b.trades,
    winners: b.winners,
    losers: b.losers,
    scratches: b.scratches,
    net_pnl: b.net_pnl,
    gross_pnl: b.gross_pnl,
    total_fees: b.total_fees,
    win_rate,
    expectancy,
    profit_factor,
    avg_winner,
    avg_loser,
  }
}

/** Aggregate per-tier stats from a trade list. Returns rows ordered
 *  A+ → A → B → C, including only tiers that have at least one trade. */
export function aggregateTierPerformance(
  trades: readonly TradeListRow[],
): TierPerformanceRow[] {
  const buckets = new Map<PlaybookTier, Bucket>()

  for (const t of trades) {
    if (!t.playbook_tier) continue
    let b = buckets.get(t.playbook_tier)
    if (!b) {
      b = emptyBucket()
      buckets.set(t.playbook_tier, b)
    }
    b.trades += 1
    b.net_pnl += t.net_pnl
    b.gross_pnl += t.gross_pnl
    b.total_fees += t.total_fees
    if (t.net_pnl > SCRATCH_THRESHOLD) {
      b.winners += 1
      b.winners_sum += t.net_pnl
    } else if (t.net_pnl < -SCRATCH_THRESHOLD) {
      b.losers += 1
      b.losers_sum += t.net_pnl
    } else {
      b.scratches += 1
    }
  }

  const rows: TierPerformanceRow[] = []
  for (const tier of PLAYBOOK_TIERS) {
    const b = buckets.get(tier)
    if (b) rows.push(bucketToRow(tier, b))
  }
  return rows
}

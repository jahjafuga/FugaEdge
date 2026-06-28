/** Quality tier for a setup. Ordered A+ → A → B → C; B is the neutral
 *  default for un-graded setups. Drives the Setup Library badge, the
 *  trades-table inline badge, the A+ Setups quick filter, and the Tier
 *  Performance analytics aggregator. */
export const PLAYBOOK_TIERS = ['A+', 'A', 'B', 'C'] as const
export type PlaybookTier = (typeof PLAYBOOK_TIERS)[number]

export interface Playbook {
  id: number
  name: string
  description: string
  rules: string
  ideal_conditions: string
  archived: boolean
  /** v0.2.5 Beat 3 — app-owned protected row (the seeded "No Setup"). Exposed to
   *  the renderer so the picker can pin/identify the system row and the
   *  confluence filter can exclude it. Mapped from the 0/1 column like archived. */
  is_system: boolean
  tier: PlaybookTier
  created_at: string
}

export interface PlaybookStats {
  trade_count: number
  net_pnl: number
  winners: number
  losers: number
  scratches: number
  win_rate: number | null
  profit_factor: number | null
  avg_winner: number | null
  avg_loser: number | null
  largest_winner: number | null
  largest_loser: number | null
  /** Average R-multiple. Null until feature #4 (R-multiple tracking) lands. */
  avg_r: number | null
}

export interface PlaybookWithStats extends Playbook {
  stats: PlaybookStats
}

export interface CreatePlaybookInput {
  name: string
  description?: string
  rules?: string
  ideal_conditions?: string
  tier?: PlaybookTier
}

export interface UpdatePlaybookInput {
  id: number
  name?: string
  description?: string
  rules?: string
  ideal_conditions?: string
  archived?: boolean
  tier?: PlaybookTier
}

export interface SetPlaybookOnTradeInput {
  trade_id: number
  playbook_id: number | null
}

/** Phase 2 bulk-retag — set the PRIMARY playbook on many trades at once. Mirrors
 *  SetPlaybookOnTradeInput with trade_ids[]; `playbook_id: null` clears the
 *  primary on all of them. */
export interface BulkSetPlaybookInput {
  trade_ids: number[]
  playbook_id: number | null
}

/** A single confluence (secondary) tag on a trade — a lightweight projection of
 *  the playbook joined from the trade_playbooks junction. Distinct from the
 *  PRIMARY setup (trades.playbook_id): a playbook is primary OR secondary on a
 *  given trade, never both, and a system "No Setup" row can never be a
 *  secondary, so tier is always a real grade here. */
export interface PlaybookTag {
  id: number
  name: string
  tier: PlaybookTier
}

/** Add/remove a secondary confluence tag on a trade (the trade_playbooks
 *  junction). The primary setup keeps its own SetPlaybookOnTradeInput. */
export interface PlaybookTagInput {
  trade_id: number
  playbook_id: number
}

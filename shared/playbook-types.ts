export interface Playbook {
  id: number
  name: string
  description: string
  rules: string
  ideal_conditions: string
  archived: boolean
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
}

export interface UpdatePlaybookInput {
  id: number
  name?: string
  description?: string
  rules?: string
  ideal_conditions?: string
  archived?: boolean
}

export interface SetPlaybookOnTradeInput {
  trade_id: number
  playbook_id: number | null
}

export interface OverviewStats {
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  scratches: number
  win_rate: number | null         // null when there are no decided trades (winners+losers = 0)
  profit_factor: number | null    // null when there are no losing trades — UI shows "N/A"
  avg_winner: number | null       // null when there are no winning trades — UI shows "—"
  avg_loser: number | null        // null when there are no losing trades — UI shows "—"
  largest_winner: number | null   // null when there are no winning trades
  largest_loser: number | null    // null when there are no losing trades
}

export type TimeRange = '7d' | '30d' | '60d' | '90d' | 'all'

export const TIME_RANGES: TimeRange[] = ['7d', '30d', '60d', '90d', 'all']

export interface DailyPnlPoint {
  date: string       // YYYY-MM-DD
  net_pnl: number
  trade_count: number
  avg_trade_pnl: number   // net_pnl / trade_count for that day
}

export interface SessionTrade {
  id: number
  symbol: string
  side: 'long' | 'short'
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  total_fees: number
  net_pnl: number
  playbook_name: string | null
  confidence: number | null
}

export interface LatestSession {
  date: string                   // most recent date with trades; '' if none
  net_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  trades: SessionTrade[]
}

export interface MonthCalendar {
  year: number    // e.g. 2026
  month: number   // 1..12
  days: DailyPnlPoint[]
}

export interface DashboardSettings {
  max_daily_loss: number
  account_size: number
}

export interface DashboardData {
  range: TimeRange               // echoes back the requested range
  range_start: string | null     // YYYY-MM-DD lower bound, or null for 'all'
  overview: OverviewStats        // filtered by range
  daily: DailyPnlPoint[]         // filtered by range, ascending
  latest: LatestSession          // NOT filtered — always most recent session
  month: MonthCalendar           // NOT filtered — current/latest month
  settings: DashboardSettings
  /** Consecutive market days (Mon–Fri) up to today where the user either
   *  traded or recorded a journal entry. 0 if today/yesterday broke the chain. */
  discipline_streak: number
  /** true if no trades exist at all — UI shows an empty state */
  empty: boolean
}

import type { PlaybookTier } from './playbook-types'

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
  pnl_ratio: number | null        // avg win ÷ |avg loss| (NOT profit factor). ∞ no losers; 0 no winners; null no decided
  avg_winner: number | null       // null when there are no winning trades — UI shows "—"
  avg_loser: number | null        // null when there are no losing trades — UI shows "—"
  largest_winner: number | null   // null when there are no winning trades
  largest_loser: number | null    // null when there are no losing trades
}

export type TimeRange = '1d' | '7d' | '30d' | '60d' | '90d' | 'all'

export const TIME_RANGES: TimeRange[] = ['1d', '7d', '30d', '60d', '90d', 'all']

/** Human label for a range — shared by the Dashboard subtitle and the EdgeIQ
 *  Edge Score chip so they read identically. */
export const RANGE_LABEL: Record<TimeRange, string> = {
  '1d': 'today',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '60d': 'last 60 days',
  '90d': 'last 90 days',
  all: 'all time',
}

/** Day count for a range; null = 'all' (no lower bound — skip day-windowing). */
export function rangeDays(range: TimeRange): number | null {
  switch (range) {
    case '1d':
      return 1
    case '7d':
      return 7
    case '30d':
      return 30
    case '60d':
      return 60
    case '90d':
      return 90
    case 'all':
      return null
  }
}

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
  /** Joined from `playbooks.tier`. Null when the trade has no playbook. */
  playbook_tier: PlaybookTier | null
  confidence: number | null
}

export interface LatestSession {
  date: string                   // most recent date with trades; '' if none
  net_pnl: number
  /** Pre-fees gross P&L for the session. Added in v0.1.5 so the dashboard
   *  summary line can show Gross / Fees / Net as distinct items. */
  gross_pnl: number
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
  daily_profit_target: number
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

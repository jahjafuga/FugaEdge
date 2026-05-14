export interface CalendarDay {
  date: string         // YYYY-MM-DD
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  day_tags: string[]   // FOMC, Earnings, Choppy… per-day labels
  has_journal: boolean // any journal content on this date (premarket, postsession, rules, emotion, OR no-trade-day mark)
  /** True when the trader marked this date as a no-trade / sit-out day.
   *  Unifies both write paths: the dashboard's "Mark as no-trade day"
   *  button (writes session_meta.no_trade_day) AND the calendar's sit-out
   *  modal (writes journal.day_tags = ["no-trade-day"]). Counters and
   *  calendar markers should always read this field, never re-check the
   *  underlying stores. */
  no_trade_day: boolean
  /** Market sentiment 1..5 (or null) the trader assigned to this session.
   *  Sourced from the session_meta table via the calendar query LEFT JOIN. */
  sentiment: number | null
}

export interface SaveDayTagsInput {
  date: string
  tags: string[]
}

export interface DayTagsResult {
  date: string
  tags: string[]
}

export interface WeeklySummary {
  week_start: string          // YYYY-MM-DD (Sunday)
  week_end: string            // YYYY-MM-DD (Saturday)
  in_month: boolean           // true if any day of the week falls in the visible month
  trade_count: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  winners: number
  losers: number
  win_rate: number | null
  profit_factor: number | null
  avg_winner: number | null
  avg_loser: number | null
  best_day: { date: string; net_pnl: number } | null
  worst_day: { date: string; net_pnl: number } | null
  best_symbol: { symbol: string; net_pnl: number } | null
  days_traded: number
  days_journaled: number
  top_mistake: { name: string; count: number } | null
  emotion_avg: number | null
  // Streak going into the next week — counts consecutive winning/losing days
  // walking back from the last traded day on or before week_end.
  streak: { kind: 'win' | 'loss' | 'none'; days: number }
  notes: string
}

export interface SaveWeekNotesInput {
  week_start: string
  text: string
}

export interface WeekNotesResult {
  week_start: string
  text: string
}

export interface CalendarMonthStats {
  year: number
  month: number          // 1..12
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  trading_days: number
}

export interface CalendarRange {
  earliest: string | null
  latest: string | null
  monthsWithTrades: string[]   // "YYYY-MM"
}

export interface CalendarMonth {
  stats: CalendarMonthStats
  days: CalendarDay[]          // only days that have trades; rest implied empty
  range: CalendarRange
  weeks: WeeklySummary[]       // 6 entries, one per calendar grid row (Sun-start)
}

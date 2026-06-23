export interface CalendarDay {
  date: string         // YYYY-MM-DD
  net_pnl: number
  gross_pnl: number
  total_fees: number
  trade_count: number
  winners: number
  losers: number
  /** Per-day average winner / average loser over net P&L (null when the day has
   *  no winning / no losing trades). Raw honest fields - the cell derives the
   *  P/L ratio = avg_winner / |avg_loser|, matching winLossRatio in
   *  src/core/performance/metrics.ts. */
  avg_winner: number | null
  avg_loser: number | null
  day_tags: string[]   // FOMC, Earnings, Choppy… per-day labels
  has_journal: boolean // any journal content on this date (premarket, postsession, rules, emotion, OR no-trade-day mark)
  /** True when the trader marked this date as a no-trade / sit-out day.
   *  Unifies both write paths: the dashboard's "Mark as no-trade day"
   *  button (writes session_meta.no_trade_day) AND the calendar's sit-out
   *  modal (writes journal.day_tags = ["no-trade-day"]). Counters and
   *  calendar markers should always read this field, never re-check the
   *  underlying stores. */
  no_trade_day: boolean
  /** True when this sit-out day was specifically a market holiday — derived
   *  from the sit-out modal storing "Sat out: Holiday (Market Closed)" in the
   *  journal's postsession_notes (a LIKE on that literal label in the calendar
   *  query). Only meaningful when no_trade_day is also true; drives the calendar
   *  cell's closed-sign marker. */
  is_holiday: boolean
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

// ── Yearly view (v0.3.0 Beat 1) ─────────────────────────────────────────────

/** One month's roll-up for the 12-tile yearly overview: the SAME nine fields as
 *  CalendarMonthStats, plus the per-MONTH avg winner / avg loser so a tile can
 *  show a P/L ratio (avg_winner / |avg_loser|) consistent with the per-day cells
 *  (CalendarDay) and the weekly panels. avg_winner / avg_loser are null when the
 *  month has no winning / no losing trades — honest, never 0 — exactly how
 *  CalendarDay types its per-day pair. */
export interface CalendarYearMonth extends CalendarMonthStats {
  avg_winner: number | null
  avg_loser: number | null
}

export interface CalendarYear {
  year: number
  /** Always 12 entries, January..December. A month with no trades comes back as
   *  a zero row (trade_count 0, net_pnl 0, avg_winner/avg_loser null) so the grid
   *  is always 12 tiles; the renderer treats trade_count === 0 as the empty state
   *  (em-dash, not $0). */
  months: CalendarYearMonth[]
  /** Same range shape getCalendarMonth returns (earliest/latest + the
   *  "YYYY-MM" monthsWithTrades) — drives prev/next-year boundary logic. */
  range: CalendarRange
}

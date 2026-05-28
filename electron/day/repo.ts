import { computeDayMetrics } from '@/core/analytics/day'
import type { DayDetail } from '@shared/day-types'
import { listTrades } from '../trades/list'

// v0.2.2 Day 1 — Day Detail data assembly.
//
// Reuses listTrades({date}) for the day's TradeListRow[] and feeds them into
// the pure computeDayMetrics. ExitDelta wiring is deferred to a follow-up
// (Money Left card renders the "awaiting intraday data" empty state in the
// meantime — see Decision 3 in docs/plans/v0_2_2-calendar-day-detail.md).
//
// Day-level notes and mistakes ship in Day 4 — fields stubbed null/[] for now.
export function getDayDetail(date: string): DayDetail {
  const trades = listTrades({ date })
  const metrics = computeDayMetrics({ date, trades, exitDeltas: [] })

  return {
    date,
    metrics,
    trades,
    note: null,
    dayMistakes: [],
  }
}

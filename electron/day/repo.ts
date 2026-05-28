import { computeDayMetrics } from '@/core/analytics/day'
import type { DayDetail } from '@shared/day-types'
import { listTrades } from '../trades/list'
import { getSessionMeta } from '../session/repo'

// v0.2.2 Day 1 — Day Detail data assembly.
//
// Reuses listTrades({date}) for the day's TradeListRow[] and feeds them into
// the pure computeDayMetrics. ExitDelta wiring is deferred to a follow-up
// (Money Left card renders the "awaiting intraday data" empty state in the
// meantime — see Decision 3 in docs/plans/v0_2_2-calendar-day-detail.md).
//
// Day 4: the day-level note lives on session_meta.notes (reused, not a new
// table). Day-level mistakes land in Day 4.2.
export function getDayDetail(date: string): DayDetail {
  const trades = listTrades({ date })
  const metrics = computeDayMetrics({ date, trades, exitDeltas: [] })
  const meta = getSessionMeta(date)

  return {
    date,
    metrics,
    trades,
    note: meta?.notes ? meta.notes : null,
    dayMistakes: [],
  }
}

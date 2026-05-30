import { computeDayMetrics } from '@/core/analytics/day'
import { computeExitDeltas } from '@/core/analytics/exit-quality'
import type { DayDetail } from '@shared/day-types'
import { listTrades } from '../trades/list'
import { getSessionMeta, getDayMistakes } from '../session/repo'

// v0.2.2 Day 1 — Day Detail data assembly.
//
// Reuses listTrades({date}) for the day's TradeListRow[] and feeds them into
// the pure computeDayMetrics. Day 5a.1: ExitDelta is derived from each trade's
// own exit fills (computeExitDeltas — fill-based, not intraday), so Money Left
// populates whenever the day has a scaled-out trade.
//
// Day 4: the day-level note and mistake tags both live on session_meta
// (notes + day_mistakes_json) — reused, no new tables.
export function getDayDetail(date: string): DayDetail {
  const trades = listTrades({ date })
  const metrics = computeDayMetrics({ date, trades, exitDeltas: computeExitDeltas(trades) })
  const meta = getSessionMeta(date)

  return {
    date,
    metrics,
    trades,
    note: meta?.notes ? meta.notes : null,
    dayMistakes: getDayMistakes(date),
  }
}

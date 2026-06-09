// Pure date-preset helper for the v0.2.4 Technical Analysis filter bar.
// Independent of the Reports QuickRange enum (different preset list,
// different default) per the locked design decision.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports — the
// identical module runs server-side on the future Next.js + Postgres port.

import { addDays, rangeFromDates, startOfYear } from '@/core/performance/dateUtils'
import type { DateRange } from '@/core/performance/types'

export type DatePreset =
  | 'today'
  | '7d'
  | '30d'
  | '90d'
  | 'ytd'
  | 'custom'

export function rangeForDatePreset(
  preset: DatePreset,
  now: Date = new Date(),
): DateRange | null {
  // 'custom' returns null — caller uses the from/to fields directly.
  if (preset === 'custom') return null
  if (preset === 'ytd') return rangeFromDates(startOfYear(now), now)
  // Mirrors rangeForQuick's days-1-back math (dateUtils.ts:89-95): the range
  // is inclusive of `now`, so 'today' is zero days back, '7d' is 6 back, etc.
  const days = preset === 'today' ? 1 : preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  const from = addDays(now, -(days - 1))
  return rangeFromDates(from, now)
}

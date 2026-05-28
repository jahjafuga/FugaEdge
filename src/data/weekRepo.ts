import type { WeekDetail } from '@shared/week-types'

// v0.2.2 Day 4.5b — renderer-side typed client for the Weekly Review data
// source. Same pattern as dayRepo: components import from here, not window.api.
export const weekRepo = {
  getWeekDetail(weekStart: string): Promise<WeekDetail> {
    return window.api.weekDetailGet(weekStart)
  },
}

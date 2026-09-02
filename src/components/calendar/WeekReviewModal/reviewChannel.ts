import type { ReviewChannel } from '@/components/calendar/reviewChannel'

// The WEEKLY review pair, bound to one week. weekStart is the Sunday the
// calendar grid row is anchored on -- buildWeeklyReviewIntent's guard rejects
// anything else, which is why the id is bound HERE, by the host that knows it,
// and never derived inside the tab.
export function weeklyReview(weekStart: string): ReviewChannel {
  return {
    get: () => window.api.xpWeeklyReviewGet({ weekStart }),
    complete: () => window.api.xpWeeklyReviewComplete({ weekStart }),
  }
}

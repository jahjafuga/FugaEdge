import type { ReviewChannel } from '@/components/calendar/reviewChannel'

// The MONTHLY review pair, bound to one month. monthId is 'YYYY-MM' -- NOT the
// month's first day, which is what the period start would have handed it. The
// key prefix differs from the week's before any id is interpolated, so the two
// can never collide in the ledger's UNIQUE column.
export function monthlyReview(monthId: string): ReviewChannel {
  return {
    get: () => window.api.xpMonthlyReviewGet({ monthId }),
    complete: () => window.api.xpMonthlyReviewComplete({ monthId }),
  }
}

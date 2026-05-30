import type { DayMetrics } from '@shared/day-types'
import Card from '@/components/ui/Card'
import MistakesChecklist from '@/components/trades/MistakesChecklist'

interface MistakesTabProps {
  /** Per-trade mistake tags aggregated across the day (read-only). */
  mistakeTagCounts: DayMetrics['mistakeTagCounts']
  /** Day-level mistake tags (lifted to DayDetailModal so they survive tab
   *  switches). */
  dayMistakes: string[]
  onChangeDayMistakes: (next: string[]) => void
}

// v0.2.2 Day 4 — presentational. Two halves:
//  1. Read-only rollup of mistake tags aggregated across the day's trades
//     (per-trade tags on trades.mistakes_json).
//  2. Day-level mistake tags that tag the DAY itself (session_meta.day_mistakes_json),
//     edited via the shared MistakesChecklist (same mistake_list vocabulary).
//     State + the save-on-toggle path live in DayDetailModal — this tag set
//     is self-contained (nothing outside this tab reads it), so the toggle
//     persists without a re-fetch.
export default function MistakesTab({
  mistakeTagCounts,
  dayMistakes,
  onChangeDayMistakes,
}: MistakesTabProps) {
  return (
    <div className="space-y-4">
      <Card
        title="Mistakes tagged on trades"
        subtitle="Aggregated across today's trades."
      >
        {mistakeTagCounts.length === 0 ? (
          <div className="text-sm text-fg-tertiary">
            No mistakes tagged on any trade today.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mistakeTagCounts.map((mc) => (
              <div
                key={mc.tag}
                className="rounded-full border border-loss/30 bg-loss/[0.06] px-3 py-1 text-xs"
              >
                <span className="text-fg-primary">{mc.tag}</span>
                <span className="ml-1.5 font-mono text-loss tnum">×{mc.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Day-level mistakes"
        subtitle="Tag the day itself — patterns not tied to a single trade."
      >
        <MistakesChecklist selected={dayMistakes} onChange={onChangeDayMistakes} />
      </Card>
    </div>
  )
}

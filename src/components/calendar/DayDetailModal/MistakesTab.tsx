import type { DayMetrics } from '@shared/day-types'
import Card from '@/components/ui/Card'

interface MistakesTabProps {
  /** Per-trade mistake tags aggregated across the day (read-only). */
  mistakeTagCounts: DayMetrics['mistakeTagCounts']
}

// v0.2.2 Day 4 — presentational. Read-only rollup of mistake tags aggregated
// across the day's trades (per-trade tags via the trade_mistake junction). The
// day-level picker that previously lived here was removed in the mistakes
// reshape; mistakes live only on trades now. Reinstated (djsevans87 #7) after
// the 2f51c52 display sweep.
export default function MistakesTab({ mistakeTagCounts }: MistakesTabProps) {
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
    </div>
  )
}

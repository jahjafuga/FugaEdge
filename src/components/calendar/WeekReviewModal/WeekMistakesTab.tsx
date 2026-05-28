import type { WeekMetrics } from '@shared/week-types'
import Card from '@/components/ui/Card'

interface WeekMistakesTabProps {
  /** Per-trade mistake tags aggregated across the week (read-only rollup). */
  mistakeTagCounts: WeekMetrics['mistakeTagCounts']
}

// v0.2.2 Day 4.5d — week-scoped mistake rollup. Per-trade tags aggregated
// across the week (the same disjoint per-trade data path as the day tab's
// rollup half). There is NO week-level mistake picker — only days have one
// (session_meta.day_mistakes_json); a week tags nothing of its own. Pure UI
// over WeekMetrics.mistakeTagCounts (computed in week.ts).
export default function WeekMistakesTab({ mistakeTagCounts }: WeekMistakesTabProps) {
  return (
    <Card title="Mistakes tagged on trades" subtitle="Aggregated across the week's trades.">
      {mistakeTagCounts.length === 0 ? (
        <div className="text-sm text-fg-tertiary">No mistakes tagged on any trade this week.</div>
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
  )
}

import type { MistakesTable } from '@shared/mistakes-types'
import Card from '@/components/ui/Card'
import MistakesTableView from '@/components/calendar/MistakesTableView'

interface MistakesTabProps {
  /** The day's mistakes table, computed in src/core/analytics/mistakes.ts —
   *  the SAME function the week tab's table comes from. */
  table: MistakesTable
}

// v0.2.2 Day 4 — presentational. Read-only rollup of mistake tags aggregated
// across the day's trades (per-trade tags via the trade_mistake junction). The
// day-level picker that previously lived here was removed in the mistakes
// reshape; mistakes live only on trades now. Reinstated (djsevans87 #7) after
// the 2f51c52 display sweep.
//
// djsevans87 30 Jul — the CHIPS became the table Analytics > Psychology has.
// The markup is MistakesTableView, shared with the week tab, so the two
// periods cannot drift apart in either arithmetic or appearance.
export default function MistakesTab({ table }: MistakesTabProps) {
  return (
    <div className="space-y-4">
      <Card
        title="Mistakes tagged on trades"
        subtitle="Aggregated across today's trades."
      >
        <MistakesTableView table={table} />
      </Card>
    </div>
  )
}

import type { PeriodWording } from '@shared/period-wording'
import type { MistakesTable } from '@shared/mistakes-types'
import Card from '@/components/ui/Card'
import MistakesTableView from '@/components/calendar/MistakesTableView'

interface WeekMistakesTabProps {
  /** The week's mistakes table, computed in src/core/analytics/mistakes.ts —
   *  the SAME function the day tab's table comes from. */
  table: MistakesTable
  /** The period's own words, supplied by whoever mounts this tab. */
  wording: PeriodWording
}

// v0.2.2 Day 4.5d — week-scoped mistake rollup. Per-trade tags aggregated
// across the week (the same disjoint per-trade data path as the day tab's
// rollup half). There is NO week-level mistake picker — mistakes are tagged
// per trade; a week tags nothing of its own. Reinstated (djsevans87 #7) after
// the 2f51c52 display sweep.
//
// djsevans87 30 Jul — the CHIPS became the table Analytics > Psychology has.
// The markup is MistakesTableView, shared with the day tab.
export default function WeekMistakesTab({ table, wording }: WeekMistakesTabProps) {
  return (
    <Card title="Mistakes tagged on trades" subtitle={wording.mistakesSubtitle}>
      <MistakesTableView table={table} />
    </Card>
  )
}

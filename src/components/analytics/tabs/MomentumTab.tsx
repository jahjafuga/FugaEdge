import SectionHeader from '@/components/ui/SectionHeader'
import MomentumSection from '@/components/analytics/MomentumSection'
import CatalystBreakdownCard from '@/components/analytics/CatalystBreakdownCard'
import type { AnalyticsData } from '@shared/analytics-types'
import type { BucketStats } from '@shared/reports-types'

interface MomentumTabProps {
  data: AnalyticsData
  /** reports.byDayOfWeek — threaded in for the day-of-week column chart.
   *  Defaults to [] at the call site when reports hasn't loaded, so the
   *  chart's own empty state handles the no-data case. */
  dayOfWeek: BucketStats[]
}

export default function MomentumTab({ data, dayOfWeek }: MomentumTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Momentum"
        description="The patterns specific to your style — entry timeframe, distance from EMA9, time-of-day bias, and confidence."
      />
      <MomentumSection
        momentum={data.momentum}
        totalTrades={data.trade_count}
        dayOfWeek={dayOfWeek}
      />
      <CatalystBreakdownCard data={data.catalyst} />
    </div>
  )
}

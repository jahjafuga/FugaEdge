import SectionHeader from '@/components/ui/SectionHeader'
import MomentumSection from '@/components/analytics/MomentumSection'
import CatalystBreakdownCard from '@/components/analytics/CatalystBreakdownCard'
import type { AnalyticsData } from '@shared/analytics-types'

interface MomentumTabProps {
  data: AnalyticsData
}

export default function MomentumTab({ data }: MomentumTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Momentum"
        description="The patterns specific to your style — entry timeframe, distance from EMA9, time-of-day bias, and confidence."
      />
      <MomentumSection momentum={data.momentum} totalTrades={data.trade_count} />
      <CatalystBreakdownCard data={data.catalyst} />
    </div>
  )
}

import CollapsibleCard from '@/components/ui/CollapsibleCard'
import ReportBucketTable from './ReportBucketTable'
import WinLossDaysTable from './WinLossDaysTable'
import DrawdownSection from './DrawdownSection'
import type { ReportsData } from '@shared/reports-types'

interface BreakdownTabProps {
  data: ReportsData
}

export default function BreakdownTab({ data }: BreakdownTabProps) {
  return (
    <div className="space-y-4">
      <CollapsibleCard
        title="Win vs loss days"
        subtitle="Day-by-day breakdown. Green rows = green days, red rows = red days."
      >
        <WinLossDaysTable days={data.winLossDays} />
      </CollapsibleCard>

      <CollapsibleCard
        title="Drawdown"
        subtitle="Worst peak-to-trough decline plus equity curve."
        defaultOpen={false}
      >
        <DrawdownSection drawdown={data.drawdown} />
      </CollapsibleCard>

      <CollapsibleCard
        title="By price range"
        subtitle="Bucketed by the trade's entry price per share."
      >
        <ReportBucketTable keyHeader="Price" buckets={data.byPriceRange} />
      </CollapsibleCard>

      <CollapsibleCard
        title="By day of week"
        subtitle="Trade days grouped by weekday."
      >
        <ReportBucketTable keyHeader="Day" buckets={data.byDayOfWeek} />
      </CollapsibleCard>

      <CollapsibleCard
        title="By hour"
        subtitle="Grouped by the hour the round trip opened."
      >
        <ReportBucketTable keyHeader="Hour" buckets={data.byHour} />
      </CollapsibleCard>

      <CollapsibleCard
        title="By share size"
        subtitle="Bucketed by peak position size during the round trip."
      >
        <ReportBucketTable keyHeader="Size" buckets={data.byShareSize} />
      </CollapsibleCard>
    </div>
  )
}

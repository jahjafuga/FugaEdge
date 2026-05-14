import CollapsibleCard from '@/components/ui/CollapsibleCard'
import Flag from '@/components/ui/Flag'
import ReportBucketTable from './ReportBucketTable'
import WinLossDaysTable from './WinLossDaysTable'
import DrawdownSection from './DrawdownSection'
import type { ReportsData } from '@shared/reports-types'
import {
  COUNTRY_NAMES,
  REGION_REPRESENTATIVE_COUNTRY,
  type Region,
} from '@/core/country/regions'

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
        title="By region"
        subtitle="Bucketed by trading region. Unknown trades grouped at the bottom."
      >
        <ReportBucketTable
          keyHeader="Region"
          buckets={data.byRegion}
          emptyText="Add country to trades to see region breakdown."
          cellRenderer={(b) => {
            // REGION_REPRESENTATIVE_COUNTRY only carries flag mappings for
            // single-country regions (USA, China, Israel, ...). Multi-country
            // regions (Europe, LatAm, Other) and Unknown return null and
            // render as plain text.
            const iso = REGION_REPRESENTATIVE_COUNTRY[b.key as Region] ?? null
            return (
              <span className="inline-flex items-center gap-2 font-mono text-sm text-fg-primary">
                {iso && <Flag iso={iso} size={18} title={b.key} />}
                <span>{b.key}</span>
              </span>
            )
          }}
        />
      </CollapsibleCard>

      <CollapsibleCard
        title="By country"
        subtitle="Top countries by trade count. Hides countries with fewer than 3 trades."
      >
        <ReportBucketTable
          keyHeader="Country"
          buckets={data.byCountry}
          emptyText="Add country to 3+ trades to see breakdown."
          cellRenderer={(b) => {
            const name = COUNTRY_NAMES[b.key] ?? b.key
            return (
              <span className="inline-flex items-center gap-2 font-mono text-sm text-fg-primary">
                <Flag iso={b.key} size={18} title={name} />
                <span>{name}</span>
              </span>
            )
          }}
        />
      </CollapsibleCard>

      <CollapsibleCard
        title="By symbol"
        subtitle="Top 25 tickers by trade count."
      >
        <ReportBucketTable keyHeader="Symbol" buckets={data.bySymbol} />
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

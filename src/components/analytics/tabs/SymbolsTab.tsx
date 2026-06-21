import { Link } from 'react-router-dom'
import SectionHeader from '@/components/ui/SectionHeader'
import Flag from '@/components/ui/Flag'
import SymbolPerformance from '@/components/analytics/SymbolPerformance'
// DISABLED for v0.2.0 — re-enable in v0.3.0 with point-in-time float.
// import FloatBreakdownCard from '@/components/analytics/FloatBreakdownCard'
import BucketBarCard from '@/components/analytics/BucketBarCard'
import { int } from '@/lib/format'
import {
  COUNTRY_NAMES,
  REGION_REPRESENTATIVE_COUNTRY,
  type Region,
} from '@/core/country/regions'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'

interface SymbolsTabProps {
  data: AnalyticsData
  reports: ReportsData | null
}

// Beat B — the consolidated Symbols tab: best/worst tickers on top, then all
// four "P&L by trade characteristic" breakdowns (price, share size, float, RVOL)
// in one unified diverging-bar style (BucketBarCard), with a slim float/RVOL
// coverage line. Presentation only — the data was wired in Beat A.
export default function SymbolsTab({ data, reports }: SymbolsTabProps) {
  const va = reports?.volumeAnalysis
  const marketReady = va != null && va.status !== 'unavailable'

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Symbols"
        description="Best / worst tickers, plus the price, size, float, and relative-volume buckets that drive your P&L."
      />

      <SymbolPerformance best={data.bestSymbols} worst={data.worstSymbols} />

      {/* DISABLED for v0.2.0 — re-enable in v0.3.0 with point-in-time float. */}
      {/* <FloatBreakdownCard data={data.float} /> */}

      <CoverageLine reports={reports} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BucketBarCard
          title="P&L by price range"
          subtitle="Bucketed by avg buy price."
          buckets={reports?.byPriceRange ?? []}
          emptyText="Import more trades across different price ranges."
        />
        <BucketBarCard
          title="P&L by share size"
          subtitle="Bucketed by shares per trade."
          buckets={reports?.byShareSize ?? []}
          emptyText="More trades will fill out this distribution."
        />
        <BucketBarCard
          title="Float"
          subtitle="Bucketed by tradable float."
          buckets={va?.byFloat ?? []}
          emptyText={
            marketReady
              ? 'No float data for these trades yet.'
              : 'Refresh market data in Settings to populate float.'
          }
        />
        <BucketBarCard
          title="P&L by relative volume"
          subtitle="Trade-day volume vs 30-day average."
          buckets={va?.byRvol ?? []}
          emptyText={
            marketReady
              ? 'No relative-volume data for these trades yet.'
              : 'Refresh market data in Settings to populate RVOL.'
          }
        />
      </div>

      {/* Markets — by company attribute + geography. Moved here from Reports →
          Breakdown (migration move 2); same BucketStats[], same bar style.
          Country/Region keep their flag + full name via renderLabel. */}
      <SectionHeader
        title="Markets"
        description="Where your edge lives — by sector, symbol, and geography."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BucketBarCard
          title="P&L by sector"
          subtitle="Bucketed by company sector."
          buckets={reports?.bySector ?? []}
          emptyText="No sector data yet — run the sector & industry backfill in Settings."
        />
        <BucketBarCard
          title="P&L by industry"
          subtitle="Bucketed by company industry."
          buckets={reports?.byIndustry ?? []}
          emptyText="No industry data yet — run the sector & industry backfill in Settings."
        />
        <BucketBarCard
          title="P&L by symbol"
          subtitle="Your most-traded tickers."
          buckets={reports?.bySymbol ?? []}
          emptyText="Import trades to see your symbol breakdown."
        />
        <BucketBarCard
          title="P&L by country"
          subtitle={
            reports && reports.byCountryNotShown > 0
              ? `Bucketed by listing country · ${reports.byCountryNotShown} not shown`
              : 'Bucketed by listing country.'
          }
          buckets={reports?.byCountry ?? []}
          emptyText="Add country to 3+ trades to see breakdown."
          renderLabel={(b) => (
            <span className="inline-flex items-center gap-2 text-sm text-fg-primary">
              <Flag iso={b.key} size={16} title={COUNTRY_NAMES[b.key] ?? b.key} />
              <span className="truncate">{COUNTRY_NAMES[b.key] ?? b.key}</span>
            </span>
          )}
        />
        <BucketBarCard
          title="P&L by region"
          subtitle="Bucketed by region."
          buckets={reports?.byRegion ?? []}
          emptyText="Add country to trades to see region breakdown."
          renderLabel={(b) => {
            const iso = REGION_REPRESENTATIVE_COUNTRY[b.key as Region] ?? null
            return (
              <span className="inline-flex items-center gap-2 text-sm text-fg-primary">
                {iso && <Flag iso={iso} size={16} title={b.key} />}
                <span className="truncate">{b.key}</span>
              </span>
            )
          }}
        />
      </div>
    </div>
  )
}

// Slim float/RVOL coverage line — a quiet header, not a competing card. Shows
// the share of trades backed by market data with a thin progress bar, or a
// gentle Settings prompt when no market data is cached.
function CoverageLine({ reports }: { reports: ReportsData | null }) {
  const va = reports?.volumeAnalysis

  if (!va || va.status === 'unavailable') {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-tertiary">
        <span>Float &amp; relative-volume breakdowns need cached market data.</span>
        <Link to="/settings" className="text-gold transition-colors hover:text-gold-hover">
          Refresh in Settings
        </Link>
      </div>
    )
  }

  const coverage = va.trades_analyzed + va.trades_missing_data
  const pct = coverage > 0 ? (va.trades_analyzed / coverage) * 100 : 0

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="text-fg-tertiary">
        <span className="font-mono text-fg-secondary tnum">{pct.toFixed(0)}%</span> of trades have
        float &amp; RVOL data{' '}
        <span className="text-fg-muted">
          ({int(va.trades_analyzed)} of {int(coverage)})
        </span>
      </span>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-bg-1/60">
        <div className="h-full rounded-full bg-gold/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

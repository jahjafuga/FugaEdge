import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import StreaksCard from '@/components/analytics/StreaksCard'
import FullStatsTable from '@/components/reports/FullStatsTable'
import { duration, signed } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'

interface PerformanceTabProps {
  data: AnalyticsData
  reports: ReportsData | null
}

export default function PerformanceTab({ data, reports }: PerformanceTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Performance"
        description="System quality scores, distributional stats, and the wins-vs-losses split that drives expectancy."
      />

      {reports ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card
            title="Performance stats"
            subtitle="SQN · Kelly % · K-Ratio · Probability of random chance."
            padded={false}
          >
            <div className="p-2">
              <FullStatsTable stats={reports.fullStats} />
            </div>
          </Card>

          <div className="space-y-5">
            <Card title="Winner vs loser" subtitle="Per-trade averages and largest.">
              <div className="grid grid-cols-2 gap-3">
                <SideBlock
                  label="Avg winner"
                  tone="green"
                  amount={reports.fullStats.avg_winner}
                  detail={
                    reports.fullStats.winners > 0
                      ? `${reports.fullStats.winners} winners`
                      : 'No winners'
                  }
                />
                <SideBlock
                  label="Avg loser"
                  tone="red"
                  amount={reports.fullStats.avg_loser}
                  detail={
                    reports.fullStats.losers > 0
                      ? `${reports.fullStats.losers} losers`
                      : 'No losers'
                  }
                />
              </div>
            </Card>

            <Card title="Hold time" subtitle="How long winners, losers, and scratches stayed open.">
              <div className="grid grid-cols-3 gap-3">
                <HoldBar
                  label="Winners"
                  seconds={reports.fullStats.avg_hold_seconds_winners}
                  tone="green"
                />
                <HoldBar
                  label="Losers"
                  seconds={reports.fullStats.avg_hold_seconds_losers}
                  tone="red"
                />
                <HoldBar
                  label="Scratches"
                  seconds={reports.fullStats.avg_hold_seconds_scratches}
                  tone="muted"
                />
              </div>
              {reports.fullStats.avg_hold_seconds_winners != null &&
                reports.fullStats.avg_hold_seconds_losers != null &&
                reports.fullStats.avg_hold_seconds_winners <
                  reports.fullStats.avg_hold_seconds_losers && (
                  <div className="mt-3 rounded-md border border-loss/30 bg-loss/[0.06] p-2 text-xs text-loss">
                    Losers held longer than winners — classic hope-trade pattern.
                  </div>
                )}
            </Card>

            <Card title="Streaks">
              <div className="-mx-3 -mt-2">
                <StreaksCardInline data={data} />
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-6 text-sm text-fg-tertiary">
          Loading performance stats…
        </div>
      )}
    </div>
  )
}

function StreaksCardInline({ data }: { data: AnalyticsData }) {
  return (
    <StreaksCard
      longestWin={data.longestWinStreak}
      longestLoss={data.longestLossStreak}
      current={data.currentStreak}
    />
  )
}

function SideBlock({
  label,
  tone,
  amount,
  detail,
}: {
  label: string
  tone: 'green' | 'red'
  amount: number | null
  detail: string
}) {
  const color = tone === 'green' ? 'text-win' : 'text-loss'
  const border = tone === 'green' ? 'border-win/30' : 'border-loss/30'
  return (
    <div className={`rounded-md border ${border} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className={`mt-1 font-mono text-xl font-medium ${color}`}>
        {amount == null ? '—' : signed(amount)}
      </div>
      <div className="mt-1 text-[11px] text-fg-secondary">{detail}</div>
    </div>
  )
}

function HoldBar({
  label,
  seconds,
  tone,
}: {
  label: string
  seconds: number | null
  tone: 'green' | 'red' | 'muted'
}) {
  const color =
    tone === 'green' ? 'text-win' : tone === 'red' ? 'text-loss' : 'text-fg-primary'
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className={`mt-1 font-mono text-base font-medium ${color}`}>
        {seconds == null ? '—' : duration(seconds)}
      </div>
    </div>
  )
}

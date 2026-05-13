import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import ExitQualityTable from '@/components/analytics/ExitQualityTable'
import { duration, money } from '@/lib/format'
import type { AnalyticsData } from '@shared/analytics-types'
import type { ReportsData } from '@shared/reports-types'

interface ExecutionTabProps {
  data: AnalyticsData
  reports: ReportsData | null
}

export default function ExecutionTab({ data, reports }: ExecutionTabProps) {
  const stats = reports?.fullStats
  const mae = stats?.avg_mae_dollars ?? stats?.avg_mae ?? null
  const mfe = stats?.avg_mfe_dollars ?? stats?.avg_mfe ?? null
  const maePct = stats?.avg_mae_pct ?? null
  const mfePct = stats?.avg_mfe_pct ?? null
  const coverage = stats?.excursion_coverage ?? 0
  const total = stats?.trade_count ?? 0

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Execution"
        description="What you did with the move once you were in it — MAE, MFE, money left on the table."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title="MAE — Max Adverse Excursion"
          subtitle="How far against you each trade went on average."
        >
          {mae == null ? (
            <ExcursionPlaceholder kind="adverse" />
          ) : (
            <ExcursionBlock
              label="Avg MAE"
              dollars={mae}
              pct={maePct}
              tone="red"
              coverage={coverage}
              total={total}
            />
          )}
        </Card>

        <Card
          title="MFE — Max Favorable Excursion"
          subtitle="How far in your favor each trade went on average."
        >
          {mfe == null ? (
            <ExcursionPlaceholder kind="favorable" />
          ) : (
            <ExcursionBlock
              label="Avg MFE"
              dollars={mfe}
              pct={mfePct}
              tone="green"
              coverage={coverage}
              total={total}
            />
          )}
        </Card>
      </div>

      <Card title="Money left on the table" subtitle="Trades where the best exit beat your actual exit.">
        <ExitQualityTable rows={data.exitQuality} />
      </Card>

      {reports && (
        <Card title="Hold time by trade type" subtitle="Average seconds held per outcome.">
          <div className="grid grid-cols-3 gap-3">
            <HoldCell label="Winners" tone="green" seconds={reports.fullStats.avg_hold_seconds_winners} />
            <HoldCell label="Losers" tone="red" seconds={reports.fullStats.avg_hold_seconds_losers} />
            <HoldCell label="Scratches" tone="muted" seconds={reports.fullStats.avg_hold_seconds_scratches} />
          </div>
        </Card>
      )}

      <Card title="Slippage analysis" subtitle="Requires per-fill quoted prices alongside execution prices.">
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 font-mono uppercase tracking-widest text-gold">
            Not yet wired
          </div>
          Slippage needs quoted bid/ask at each fill timestamp. DAS Trades.csv
          gives us fills but not quotes — we'll surface this once we wire a
          Massive level-1 snapshot fetch per fill.
        </div>
      </Card>
    </div>
  )
}

function ExcursionPlaceholder({ kind }: { kind: 'adverse' | 'favorable' }) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
      <div className="mb-1 font-mono uppercase tracking-widest text-gold">
        Awaiting intraday data
      </div>
      Requires 1-minute bars covering each trade's open through close. Open
      Settings → Refresh intraday to fetch bars; the {kind === 'adverse' ? 'lowest' : 'highest'}{' '}
      price during each hold will be averaged here.
    </div>
  )
}

function ExcursionBlock({
  label,
  dollars,
  pct,
  tone,
  coverage,
  total,
}: {
  label: string
  dollars: number
  pct: number | null
  tone: 'green' | 'red'
  coverage: number
  total: number
}) {
  const color = tone === 'green' ? 'text-win' : 'text-loss'
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/40 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">{label}</div>
        <div className="font-mono text-[10px] text-fg-tertiary">
          {coverage}/{total} trades
        </div>
      </div>
      <div className={`mt-1 font-mono text-2xl font-medium ${color}`}>
        {money(dollars)}
        <span className="ml-1 text-base text-fg-tertiary">/sh</span>
      </div>
      {pct != null && (
        <div className={`mt-0.5 font-mono text-sm ${color}`}>
          {pct.toFixed(2)}%
          <span className="ml-1 text-xs text-fg-tertiary">of entry</span>
        </div>
      )}
    </div>
  )
}

function HoldCell({
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
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">{label}</div>
      <div className={`mt-1 font-mono text-base font-medium ${color}`}>
        {seconds == null ? '—' : duration(seconds)}
      </div>
    </div>
  )
}

import type { VolumeAnalysis } from '@shared/reports-types'
import { Info } from 'lucide-react'
import { int } from '@/lib/format'
import ReportBucketTable from './ReportBucketTable'

interface VolumeAnalysisPlaceholderProps {
  data: VolumeAnalysis
}

export default function VolumeAnalysisPlaceholder({ data }: VolumeAnalysisPlaceholderProps) {
  if (data.status === 'unavailable') {
    return <UnavailableState data={data} />
  }

  const coverage = data.trades_analyzed + data.trades_missing_data
  const coveragePct = coverage > 0 ? (data.trades_analyzed / coverage) * 100 : 0

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-fg-tertiary">Coverage</span>{' '}
          <span className="font-mono text-fg-primary">
            {int(data.trades_analyzed)}
          </span>
          <span className="text-fg-tertiary"> of </span>
          <span className="font-mono text-fg-primary">{int(coverage)}</span>{' '}
          <span className="text-fg-tertiary">trades</span>
          {coverage > 0 && (
            <span className="ml-2 font-mono text-gold">
              {coveragePct.toFixed(0)}%
            </span>
          )}
        </div>
        {data.trades_missing_data > 0 && (
          <div className="text-[11px] text-fg-tertiary">
            {int(data.trades_missing_data)} skipped — no market data
          </div>
        )}
      </div>

      <Section title="P&L by shares outstanding" subtitle="Bucketed by share_class_shares_outstanding from Massive.">
        {data.byFloat.length === 0 ? (
          <EmptyMini text="No float data — refresh market data or check Settings." />
        ) : (
          <ReportBucketTable keyHeader="Float" buckets={data.byFloat} />
        )}
      </Section>

      <Section title="P&L by relative volume" subtitle="Trade-day volume divided by 30-day average.">
        {data.byRvol.length === 0 ? (
          <EmptyMini text="No RVOL data — daily aggregates haven't been fetched for these trade dates yet." />
        ) : (
          <ReportBucketTable keyHeader="RVOL" buckets={data.byRvol} />
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/30">
      <div className="border-b border-border-subtle/40 px-4 py-2">
        <div className="text-[10px] uppercase tracking-wider text-gold">{title}</div>
        <div className="mt-0.5 text-xs text-fg-secondary">{subtitle}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function EmptyMini({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-sm text-fg-tertiary">{text}</div>
}

function UnavailableState({ data }: { data: VolumeAnalysis }) {
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4">
        <div className="flex items-center gap-2">
          <Info size={14} strokeWidth={2} aria-hidden="true" className="text-lg text-gold" />
          <span className="text-[10px] uppercase tracking-wider text-gold">
            Market data unavailable
          </span>
        </div>
        <p className="mt-2 text-sm text-fg-secondary">{data.reason ?? 'No market data cached.'}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DimSection
          title="P&L by shares outstanding"
          buckets={['< 5M', '5–20M', '20–100M', '100M+']}
        />
        <DimSection
          title="P&L by relative volume"
          buckets={['0–2×', '2–5×', '5–10×', '10×+']}
        />
      </div>
    </div>
  )
}

function DimSection({ title, buckets }: { title: string; buckets: string[] }) {
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/30 p-4 opacity-60">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{title}</div>
      <ul className="mt-2 space-y-2">
        {buckets.map((b) => (
          <li
            key={b}
            className="flex items-center justify-between gap-2 border-b border-border-subtle/20 py-1.5 last:border-b-0"
          >
            <span className="font-mono text-xs text-fg-secondary">{b}</span>
            <div className="h-2 w-1/2 rounded-sm bg-white/[0.04]" />
          </li>
        ))}
      </ul>
    </div>
  )
}

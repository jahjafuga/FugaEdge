import Card from '@/components/ui/Card'
import HorizontalBarChart from './HorizontalBarChart'
import type { BucketStats, ReportsData } from '@shared/reports-types'
import { int, pnlClass, signed } from '@/lib/format'
import { Link } from 'react-router-dom'

interface VolumeTabProps {
  data: ReportsData
}

export default function VolumeTab({ data }: VolumeTabProps) {
  const va = data.volumeAnalysis

  if (va.status === 'unavailable') {
    return (
      <Card title="Volume analysis" subtitle="Float and relative volume buckets.">
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-5">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg text-gold">ⓘ</span>
            <span className="text-[10px] uppercase tracking-widest text-gold">
              Market data unavailable
            </span>
          </div>
          <p className="mt-2 text-sm text-fg-secondary">{va.reason}</p>
          <Link
            to="/settings"
            className="mt-3 inline-block rounded-md bg-gold px-4 py-1.5 text-xs font-medium text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
          >
            Open Settings
          </Link>
        </div>
      </Card>
    )
  }

  const coverage = va.trades_analyzed + va.trades_missing_data
  const coveragePct = coverage > 0 ? (va.trades_analyzed / coverage) * 100 : 0

  return (
    <div className="space-y-5">
      <Card title="Volume analysis coverage" subtitle="How much of your trade history has market data." hover>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-2xl text-gold">
              {coveragePct.toFixed(0)}%
            </div>
            <div className="mt-1 text-xs text-fg-secondary">
              <span className="font-mono text-fg-primary">{int(va.trades_analyzed)}</span>{' '}
              <span className="text-fg-tertiary">of</span>{' '}
              <span className="font-mono text-fg-primary">{int(coverage)}</span>{' '}
              <span className="text-fg-tertiary">trades have float & RVOL data</span>
            </div>
          </div>
          {va.trades_missing_data > 0 && (
            <div className="text-xs text-fg-tertiary">
              <span className="font-mono text-loss">{int(va.trades_missing_data)}</span> missing —
              refresh market data in Settings.
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-white/[0.05]">
          <div
            className="h-full bg-gold"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="P&L by shares outstanding" subtitle="Float proxy: share_class_shares_outstanding." padded={false} hover>
          <HorizontalBarChart buckets={va.byFloat} />
          <BucketSummary buckets={va.byFloat} />
        </Card>
        <Card title="P&L by relative volume" subtitle="Trade-day volume / 30-day average." padded={false} hover>
          <HorizontalBarChart buckets={va.byRvol} />
          <BucketSummary buckets={va.byRvol} />
        </Card>
      </div>
    </div>
  )
}

function BucketSummary({ buckets }: { buckets: BucketStats[] }) {
  if (buckets.length === 0) return null
  const best = [...buckets].sort((a, b) => b.net_pnl - a.net_pnl)[0]
  const worst = [...buckets].sort((a, b) => a.net_pnl - b.net_pnl)[0]
  return (
    <div className="border-t border-border-subtle/40 px-5 py-3">
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">Best</div>
          <div className="mt-0.5 font-mono text-fg-primary">
            {best.key}{' '}
            <span className={pnlClass(best.net_pnl)}>{signed(best.net_pnl)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">Worst</div>
          <div className="mt-0.5 font-mono text-fg-primary">
            {worst.key}{' '}
            <span className={pnlClass(worst.net_pnl)}>{signed(worst.net_pnl)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

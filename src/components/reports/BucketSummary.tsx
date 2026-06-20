import type { BucketStats } from '@shared/reports-types'
import { pnlClass, signed } from '@/lib/format'

// Best / worst bucket footer for a BucketStats[] breakdown. Dynamic — sorts by
// net P&L, so it works for any bucket count. Extracted from VolumeTab (Beat A
// of the four-card consolidation) so it survives that tab's removal and can be
// reused by SymbolsTab.
export default function BucketSummary({ buckets }: { buckets: BucketStats[] }) {
  if (buckets.length === 0) return null
  const best = [...buckets].sort((a, b) => b.net_pnl - a.net_pnl)[0]
  const worst = [...buckets].sort((a, b) => a.net_pnl - b.net_pnl)[0]
  return (
    <div className="border-t border-border-subtle/40 px-5 py-3">
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Best</div>
          <div className="mt-0.5 font-mono text-fg-primary">
            {best.key}{' '}
            <span className={pnlClass(best.net_pnl)}>{signed(best.net_pnl)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Worst</div>
          <div className="mt-0.5 font-mono text-fg-primary">
            {worst.key}{' '}
            <span className={pnlClass(worst.net_pnl)}>{signed(worst.net_pnl)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

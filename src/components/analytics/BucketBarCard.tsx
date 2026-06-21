import Card from '@/components/ui/Card'
import BucketSummary from '@/components/reports/BucketSummary'
import { int, money, percent, pnlClass, signed } from '@/lib/format'
import type { BucketStats } from '@shared/reports-types'

// Beat B — the unified "P&L by trade characteristic" breakdown card. All four
// Symbols-tab breakdowns (price, share size, float, RVOL) render through this so
// they are identical by construction: a refined diverging bar per bucket
// (loss left / profit right around a muted centre baseline), the net P&L riding
// the row, a quiet count · win-rate · avg line beneath, and the best/worst
// footer. Presentation only — consumes the BucketStats[] already wired into
// SymbolsTab; no data/query/type changes.
interface BucketBarCardProps {
  title: string
  subtitle: string
  buckets: BucketStats[]
  emptyText: string
}

export default function BucketBarCard({ title, subtitle, buckets, emptyText }: BucketBarCardProps) {
  // All bars share one |net| scale so magnitudes compare across the card. The
  // `|| 1` floor keeps an all-zero card from dividing by zero.
  const absMax = Math.max(...buckets.map((b) => Math.abs(b.net_pnl)), 1)

  return (
    <Card title={title} subtitle={subtitle} padded={false} hover>
      {buckets.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-fg-tertiary">{emptyText}</div>
      ) : (
        <>
          <div className="space-y-4 px-5 py-5">
            {buckets.map((b, i) => (
              <BucketBarRow key={b.key} b={b} absMax={absMax} index={i} />
            ))}
          </div>
          <BucketSummary buckets={buckets} />
        </>
      )}
    </Card>
  )
}

function BucketBarRow({ b, absMax, index }: { b: BucketStats; absMax: number; index: number }) {
  // Diverging: the largest |net| fills exactly half the track, so +max reaches
  // the right edge and −max the left, signs visually balanced around centre.
  const pct = Math.min(50, (Math.abs(b.net_pnl) / absMax) * 50)
  const positive = b.net_pnl > 0
  const negative = b.net_pnl < 0
  const avgPerTrade = b.net_pnl / Math.max(1, b.trade_count)

  return (
    <div
      className="animate-fade-in"
      style={{ animationDelay: `${index * 35}ms`, animationFillMode: 'backwards' }}
    >
      {/* Label + the headline net P&L, riding the top of the bar. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-fg-primary">{b.key}</span>
        <span className={`font-mono text-sm font-semibold tnum ${pnlClass(b.net_pnl)}`}>
          {signed(b.net_pnl)}
        </span>
      </div>

      {/* Diverging bar — muted continuous track, hairline centre baseline,
          rounded profit/loss fills with a soft gradient for depth. */}
      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-bg-1/60">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-subtle" />
        {positive && (
          <div
            className="absolute left-1/2 top-0 h-full rounded-r-full bg-gradient-to-r from-win/45 to-win/85"
            style={{ width: `${pct}%` }}
          />
        )}
        {negative && (
          <div
            className="absolute right-1/2 top-0 h-full rounded-l-full bg-gradient-to-l from-loss/45 to-loss/85"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      {/* Quiet secondary line — trade count · win rate · avg per trade. */}
      <div className="mt-1.5 text-right text-[11px] text-fg-tertiary">
        <span className="font-mono text-fg-secondary tnum">{int(b.trade_count)}</span>{' '}
        {b.trade_count === 1 ? 'trade' : 'trades'}
        <span className="px-1.5 text-fg-muted">·</span>
        {b.win_rate == null ? '—' : `${percent(b.win_rate, 0)} win`}
        <span className="px-1.5 text-fg-muted">·</span>
        avg{' '}
        <span className={`font-mono tnum ${pnlClass(avgPerTrade)}`}>{money(avgPerTrade)}</span>
      </div>
    </div>
  )
}

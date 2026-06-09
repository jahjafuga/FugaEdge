import type { HeaderStripStats } from '@/core/technicals/headerStrip'
import { percent, signed } from '@/lib/format'
import KpiCard from '@/components/analytics/KpiCard'

interface HeaderStripCardsProps {
  stats: HeaderStripStats
}

// The four Header Strip cards (spec §B item 2). Single row of four on wide
// viewports; wraps to 2×2 below Tailwind's `lg` (1024px — the codebase does
// not customize the breakpoint). All four share one denominator — the §C:103
// "trades with data" gate — so the count footnote reads identically on each.
export default function HeaderStripCards({ stats }: HeaderStripCardsProps) {
  const cards = [
    { label: 'MACD positive at entry', stat: stats.macdPositive },
    { label: 'Above VWAP at entry', stat: stats.aboveVwap },
    { label: 'Above 9 EMA at entry', stat: stats.aboveEma9 },
    { label: 'Discipline score (full alignment)', stat: stats.fullAlignment },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, stat }) => (
        <KpiCard
          key={label}
          label={label}
          // percent is already ×100 and pre-rounded to 1 dp; null when the
          // denominator is 0 (no trades survived the data gate) → "—".
          value={stat.percent == null ? '—' : `${stat.percent.toFixed(1)}%`}
          tone="gold"
          detail={
            <>
              {/* Win rate is a 0..1 fraction; percent(_, 0) renders whole
                  percent and returns "—" on its own for the n<5 suppression.
                  Net P&L stays neutral — the headline value already tells the
                  story, so no pnlClass green/red on the sub-line. */}
              <div>
                {percent(stat.winRate, 0)} · {signed(stat.netPnl)}
              </div>
              <div className="mt-0.5 text-fg-muted">
                (of {stats.denominator} trades with data)
              </div>
            </>
          }
        />
      ))}
    </div>
  )
}

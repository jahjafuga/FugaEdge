import type { HeaderStripStats } from '@/core/technicals/headerStrip'
import { percent, signed } from '@/lib/format'
import KpiCard from '@/components/analytics/KpiCard'

interface HeaderStripCardsProps {
  stats: HeaderStripStats
}

// The four Header Strip cards (spec §B item 2). Single row of four on wide
// viewports; wraps to 2×2 below `xl` (1280px), honoring spec §B's "<1280px wraps
// to 2×2" (previously `lg` / 1024px). The MACD / 9EMA / discipline cards share the
// §C:103 "trades with data" denominator; the VWAP card uses its own non-null-VWAP
// coverage count (stats.vwapDenominator) — which tracks the shared denominator
// since the v0.2.5 anchor unification gave premarket entries real VWAP values
// (the only null left is the degenerate zero-VWAP guard) — so its footnote
// honestly reads "of N trades with VWAP data".
export default function HeaderStripCards({ stats }: HeaderStripCardsProps) {
  const cards = [
    { label: 'MACD positive at entry', stat: stats.macdPositive, coverage: stats.denominator, coverageLabel: 'trades with data' },
    { label: 'Above VWAP at entry', stat: stats.aboveVwap, coverage: stats.vwapDenominator, coverageLabel: 'trades with VWAP data' },
    { label: 'Above 9 EMA at entry', stat: stats.aboveEma9, coverage: stats.denominator, coverageLabel: 'trades with data' },
    { label: 'Discipline score (full alignment)', stat: stats.fullAlignment, coverage: stats.denominator, coverageLabel: 'trades with data' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(({ label, stat, coverage, coverageLabel }) => (
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
                (of {coverage} {coverageLabel})
              </div>
            </>
          }
        />
      ))}
    </div>
  )
}

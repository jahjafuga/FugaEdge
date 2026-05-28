import type { DayDetail } from '@shared/day-types'
import Card from '@/components/ui/Card'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import { compactShares, int, pnlClass, signed } from '@/lib/format'

// v0.2.2 Day 2 redesign (revised) — Overview is the at-a-glance NARRATIVE of
// the day, distinct from Performance's stats table. Hero intraday equity curve
// (reused IntradayPnLChart — smooth area, green/red gradient), a one-line
// session summary, the per-symbol "what did I trade today" breakdown, and a
// count strip. No stats grid here — win rate / profit factor / avg win/loss
// live on Performance.
export default function OverviewTab({ detail }: { detail: DayDetail }) {
  const m = detail.metrics

  if (m.tradeCount === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades on this day.
      </div>
    )
  }

  // symbolBreakdown is sorted by net P&L desc. Best = top when it's a real
  // winner; worst = bottom when it's a real loser. An all-green day has no
  // "worst loss" to call out, and vice versa.
  const breakdown = m.symbolBreakdown
  const top = breakdown[0]
  const bottom = breakdown[breakdown.length - 1]
  const best = top && top.netPnl > 0 ? top : null
  const worst = bottom && bottom.netPnl < 0 ? bottom : null

  return (
    <div className="space-y-4">
      {/* Hero — reused IntradayPnLChart, tall so it owns the panel. */}
      <IntradayPnLChart trades={detail.trades} date={detail.date} height={340} />

      {/* One-line narrative session summary. */}
      <div className="px-1 text-sm text-fg-secondary">
        <span className="font-medium text-fg-primary">
          {int(m.tradeCount)} trade{m.tradeCount === 1 ? '' : 's'}
        </span>
        {m.sessionFirstTradeTime && m.sessionLastTradeTime && (
          <>
            {' · '}
            <span className="font-mono">
              {m.sessionFirstTradeTime}–{m.sessionLastTradeTime} ET
            </span>
          </>
        )}
        {' · net '}
        <span className={`font-mono font-semibold ${pnlClass(m.netPnl)}`}>{signed(m.netPnl)}</span>
        {best && (
          <>
            {' · best '}
            <span className="font-mono text-fg-primary">{best.symbol}</span>{' '}
            <span className="font-mono text-win">{signed(best.netPnl)}</span>
          </>
        )}
        {worst && (
          <>
            {' · worst '}
            <span className="font-mono text-fg-primary">{worst.symbol}</span>{' '}
            <span className="font-mono text-loss">{signed(worst.netPnl)}</span>
          </>
        )}
      </div>

      {/* Per-symbol breakdown — "what did I trade today". */}
      <Card title="Symbols traded" subtitle={`${breakdown.length} symbol${breakdown.length === 1 ? '' : 's'}`}>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {breakdown.map((s) => (
            <div key={s.symbol} className="font-mono text-sm tnum">
              <span className="text-fg-primary">{s.symbol}</span>
              <span className="text-fg-tertiary"> {s.tradeCount}× </span>
              <span className={pnlClass(s.netPnl)}>{signed(s.netPnl)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Count strip. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Trades">
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {int(m.tradeCount)}
          </div>
          <div className="mt-1 text-xs text-fg-tertiary tnum">
            {m.winCount}W · {m.lossCount}L · {m.scratchCount}S
          </div>
        </Card>

        <Card title="Shares traded">
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {compactShares(m.totalShares)}
          </div>
          <div className="mt-1 text-xs text-fg-tertiary tnum">
            {int(m.totalShares)} shares
          </div>
        </Card>
      </div>
    </div>
  )
}

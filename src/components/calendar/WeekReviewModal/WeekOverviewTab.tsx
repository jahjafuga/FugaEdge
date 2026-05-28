import type { WeekDetail } from '@shared/week-types'
import Card from '@/components/ui/Card'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import { int, signed, pnlClass, shortDate } from '@/lib/format'

// v0.2.2 Day 4.5b — Week Overview: the at-a-glance shape of the week. Equity
// curve across the week (the shared CumulativePnlChart in 'datetime' mode) +
// a narrative summary (net, win rate, best/worst DAY, streak).
export default function WeekOverviewTab({ detail }: { detail: WeekDetail }) {
  const m = detail.metrics

  if (m.tradeCount === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades this week.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card
        title="Equity curve"
        subtitle="Cumulative net P&L across the week — steps at each trade close."
      >
        <IntradayPnLChart
          trades={detail.trades}
          date={detail.weekStart}
          height={340}
          xLabelMode="datetime"
        />
      </Card>

      <div className="px-1 text-sm text-fg-secondary">
        <span className="font-medium text-fg-primary">
          {int(m.tradeCount)} trade{m.tradeCount === 1 ? '' : 's'}
        </span>
        {' over '}
        <span className="font-mono">
          {m.tradingDays} day{m.tradingDays === 1 ? '' : 's'}
        </span>
        {' · net '}
        <span className={`font-mono font-semibold ${pnlClass(m.netPnl)}`}>{signed(m.netPnl)}</span>
        {m.winRate !== null && (
          <>
            {' · '}
            <span className="font-mono">{(m.winRate * 100).toFixed(0)}%</span> win rate
          </>
        )}
        {m.bestDay && (
          <>
            {' · best '}
            <span className="font-mono text-fg-primary">{shortDate(m.bestDay.date)}</span>{' '}
            <span className="font-mono text-win">{signed(m.bestDay.netPnl)}</span>
          </>
        )}
        {m.worstDay && (
          <>
            {' · worst '}
            <span className="font-mono text-fg-primary">{shortDate(m.worstDay.date)}</span>{' '}
            <span className="font-mono text-loss">{signed(m.worstDay.netPnl)}</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Trades">
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {int(m.tradeCount)}
          </div>
          <div className="mt-1 text-xs text-fg-tertiary tnum">
            {m.winCount}W · {m.lossCount}L · {m.scratchCount}S · {m.greenDays}/{m.tradingDays} green days
          </div>
        </Card>

        <Card title="Streak into next week">
          {m.streak.kind === 'none' ? (
            <div className="text-sm text-fg-tertiary">No active streak.</div>
          ) : (
            <div
              className={`font-mono text-2xl font-semibold ${
                m.streak.kind === 'win' ? 'text-win' : 'text-loss'
              }`}
            >
              {m.streak.days}-day {m.streak.kind}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import type { DayDetail } from '@shared/day-types'
import {
  duration,
  formatProfitFactor,
  int,
  money,
  pnlClass,
  price,
  signed,
} from '@/lib/format'

interface Row {
  label: string
  value: ReactNode
  hint?: string
}

interface Section {
  title: string
  rows: Row[]
}

// v0.2.2 Day 2 — day-scoped Performance tab. Dense two-column statistics
// table modeled on Deep Analytics' FullStatsTable (same section/row chrome),
// but scoped to one trading day. Consumes the pure metrics from
// computeDayMetrics — no business logic here.
//
// Metric scope (A/B/C/D classification) is documented in the v0.2.2 plan
// addendum. Class-C multi-day stats (SQN, K-Ratio) are intentionally absent;
// Class-D excursion stats (MFE/MAE/Money Left) render the awaiting-intraday
// placeholder until Day 5 wires the data.
export default function PerformanceTab({ detail }: { detail: DayDetail }) {
  const m = detail.metrics

  if (m.tradeCount === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades on this day — nothing to measure.
      </div>
    )
  }

  const sections: Section[] = [
    {
      title: 'P&L',
      rows: [
        { label: 'Total net P&L', value: <Signed value={m.netPnl} /> },
        { label: 'Total gross P&L', value: <Signed value={m.grossPnl} /> },
        {
          label: 'Total fees',
          value: <span className={`font-mono ${m.totalFees > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}>{money(m.totalFees)}</span>,
        },
        { label: 'Avg trade P&L', value: <Signed value={m.avgTradePnl} /> },
        {
          label: 'Avg per-share gain/loss',
          value:
            m.avgPerShareGainLoss == null ? (
              <Dash />
            ) : (
              <span className={`font-mono ${pnlClass(m.avgPerShareGainLoss)}`}>
                {m.avgPerShareGainLoss >= 0 ? '+' : '−'}${price(Math.abs(m.avgPerShareGainLoss))}/sh
              </span>
            ),
        },
        {
          label: 'Profit factor',
          value: <span className="font-mono text-gold">{formatProfitFactor(m.profitFactor)}</span>,
          hint:
            m.profitFactor === Infinity
              ? 'No losing trades — profit factor is undefined (winning-only day).'
              : 'Gross wins ÷ |gross losses|.',
        },
        {
          label: 'Trade P&L std dev',
          value: m.stdDevPnl == null ? <Dash /> : <span className="font-mono text-fg-primary">{money(m.stdDevPnl)}</span>,
          hint:
            m.stdDevPnl == null
              ? 'Needs at least 3 trades — sample std dev is noise below that.'
              : `Sample std dev across ${m.tradeCount} trades.`,
        },
      ],
    },
    {
      title: 'Winners & losers',
      rows: [
        { label: 'Avg winner', value: <Signed value={m.avgWin} tone="win" /> },
        { label: 'Avg loser', value: <Signed value={m.avgLoss} tone="loss" /> },
        {
          label: 'Largest gain',
          value: m.biggestWin ? <SignedWithSymbol pnl={m.biggestWin.pnl} symbol={m.biggestWin.symbol} /> : <Dash />,
        },
        {
          label: 'Largest loss',
          value: m.worstLoss ? <SignedWithSymbol pnl={m.worstLoss.pnl} symbol={m.worstLoss.symbol} /> : <Dash />,
        },
        {
          label: 'Avg R-multiple',
          value:
            m.avgRMultiple == null ? (
              <Dash />
            ) : (
              <span className="font-mono text-fg-primary">{m.avgRMultiple.toFixed(2)}R</span>
            ),
          hint: m.avgRMultiple == null ? 'No trades have a planned risk set.' : undefined,
        },
        {
          // Momentum-specific (Decision 5 in the plan) — the first trade
          // often sets the day's tone.
          label: 'First trade',
          value: m.firstTradePnl ? (
            <span className={`font-mono ${pnlClass(m.firstTradePnl.pnl)}`}>
              {signed(m.firstTradePnl.pnl)}
              <span className="ml-1 text-fg-tertiary">{m.firstTradePnl.symbol}</span>
              {m.firstTradePnl.rMultiple !== null && (
                <span className="ml-1 text-fg-tertiary">({m.firstTradePnl.rMultiple.toFixed(2)}R)</span>
              )}
            </span>
          ) : (
            <Dash />
          ),
        },
      ],
    },
    {
      title: 'Counts & streaks',
      rows: [
        { label: 'Total trades', value: <span className="font-mono text-fg-primary">{int(m.tradeCount)}</span> },
        { label: 'Winning trades', value: <span className="font-mono text-win">{int(m.winCount)}</span> },
        { label: 'Losing trades', value: <span className="font-mono text-loss">{int(m.lossCount)}</span> },
        { label: 'Scratch trades', value: <span className="font-mono text-fg-tertiary">{int(m.scratchCount)}</span> },
        {
          label: 'Win rate',
          value: <span className="font-mono text-gold">{m.winRate == null ? '—' : `${(m.winRate * 100).toFixed(1)}%`}</span>,
          hint: m.winRate == null ? 'All scratches — no decided trades.' : 'Winners ÷ (winners + losers).',
        },
        { label: 'Max consecutive wins', value: <span className="font-mono text-win">{int(m.maxConsecutiveWins)}</span> },
        { label: 'Max consecutive losses', value: <span className="font-mono text-loss">{int(m.maxConsecutiveLosses)}</span> },
      ],
    },
    {
      title: 'Hold time',
      rows: [
        { label: 'Avg hold (all)', value: <Hold seconds={m.avgHoldSeconds} /> },
        { label: 'Avg hold (winners)', value: <Hold seconds={m.avgHoldSecondsWinners} tone="win" /> },
        { label: 'Avg hold (losers)', value: <Hold seconds={m.avgHoldSecondsLosers} tone="loss" /> },
        { label: 'Avg hold (scratches)', value: <Hold seconds={m.avgHoldSecondsScratches} /> },
      ],
    },
    {
      title: 'Activity',
      rows: [
        {
          label: 'Session window',
          value:
            m.sessionFirstTradeTime && m.sessionLastTradeTime ? (
              <span className="font-mono text-fg-primary">
                {m.sessionFirstTradeTime} – {m.sessionLastTradeTime}
              </span>
            ) : (
              <Dash />
            ),
        },
        { label: 'Notional volume', value: <span className="font-mono text-fg-primary">{money(m.totalDollarVolume)}</span> },
        {
          label: 'Most-used playbook',
          value: m.mostUsedPlaybook ? (
            <span className="text-fg-primary">
              {m.mostUsedPlaybook.playbook}
              <span className="ml-1 font-mono text-fg-tertiary">
                ({m.mostUsedPlaybook.tradeCount}×
                {m.mostUsedPlaybook.winRate !== null && `, ${(m.mostUsedPlaybook.winRate * 100).toFixed(0)}% WR`})
              </span>
            </span>
          ) : (
            <span className="text-fg-tertiary">None tagged</span>
          ),
        },
      ],
    },
    {
      title: 'Execution quality',
      rows: [
        {
          label: 'Avg MFE',
          value: m.avgMfeDollars == null ? <Awaiting /> : <Signed value={m.avgMfeDollars} />,
          hint:
            m.avgMfeDollars == null
              ? 'Max Favorable Excursion — requires intraday market data.'
              : 'Avg max favorable excursion ($/share), over trades with intraday data.',
        },
        {
          label: 'Avg MAE',
          value: m.avgMaeDollars == null ? <Awaiting /> : <Signed value={m.avgMaeDollars} />,
          hint:
            m.avgMaeDollars == null
              ? 'Max Adverse Excursion — requires intraday market data.'
              : 'Avg max adverse excursion ($/share), over trades with intraday data.',
        },
        {
          // Fill-based, NOT intraday — derived from each trade's own exit fills,
          // so it populates regardless of intraday data availability. Null only
          // when no trade scaled out with a better available exit.
          label: 'Money left on table',
          value: m.moneyLeftOnTable == null ? <Dash /> : <span className="font-mono text-fg-primary">{money(m.moneyLeftOnTable)}</span>,
          hint:
            m.moneyLeftCoverage
              ? `${m.moneyLeftCoverage.withMfe} of ${m.moneyLeftCoverage.total} trades had a better exit fill than their average exit.`
              : "Gap between a trade's average exit and its best exit fill — needs a scaled-out trade.",
        },
      ],
    },
  ]

  const hopeTrade =
    m.avgHoldSecondsWinners != null &&
    m.avgHoldSecondsLosers != null &&
    m.avgHoldSecondsLosers > m.avgHoldSecondsWinners

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="card-premium overflow-hidden">
            <div className="border-b border-border-subtle/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gold">
              {section.title}
            </div>
            <dl>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border-subtle/30 px-4 py-2 last:border-b-0"
                >
                  <dt className="text-sm text-fg-secondary" title={row.hint}>
                    {row.label}
                  </dt>
                  <dd className="text-right tnum">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {hopeTrade && (
        <div className="rounded-md border border-loss/30 bg-loss/[0.06] p-3 text-xs text-loss">
          Losers held longer than winners — classic hope-trade pattern.
        </div>
      )}

      <p className="px-1 text-[11px] text-fg-tertiary">
        Multi-day system-quality stats (SQN, K-Ratio) live in Deep Analytics → Performance.
      </p>
    </div>
  )
}

function Dash() {
  return <span className="font-mono text-fg-tertiary">—</span>
}

function Awaiting() {
  return <span className="text-[11px] uppercase tracking-wider text-gold">Awaiting intraday</span>
}

function Signed({ value, tone }: { value: number | null; tone?: 'win' | 'loss' }) {
  if (value == null) return <Dash />
  const cls = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : pnlClass(value)
  return <span className={`font-mono ${cls}`}>{signed(value)}</span>
}

function SignedWithSymbol({ pnl, symbol }: { pnl: number; symbol: string }) {
  return (
    <span className={`font-mono ${pnlClass(pnl)}`}>
      {signed(pnl)}
      <span className="ml-1 text-fg-tertiary">{symbol}</span>
    </span>
  )
}

function Hold({ seconds, tone }: { seconds: number | null; tone?: 'win' | 'loss' }) {
  if (seconds == null) return <Dash />
  const cls = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-fg-primary'
  return <span className={`font-mono ${cls}`}>{duration(seconds)}</span>
}

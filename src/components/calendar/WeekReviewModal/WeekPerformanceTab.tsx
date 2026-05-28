import type { ReactNode } from 'react'
import type { WeekDetail, WeekMetrics } from '@shared/week-types'
import Card from '@/components/ui/Card'
import { formatProfitFactor, int, money, pnlClass, price, shortDate, signed } from '@/lib/format'

interface Row {
  label: string
  value: ReactNode
  hint?: string
}

interface Section {
  title: string
  rows: Row[]
}

// v0.2.2 Day 4.5c — Week Performance: the pattern-spotting tab. Mirrors the Day
// Performance tab's dense sectioned stat-table chrome, scoped to a week, with
// day-by-day P&L bars on top as the one week-specific visual. Consumes the pure
// WeekMetrics (computeWeekMetrics) — no business logic here. Hold-time and
// per-trade dispersion are intentionally absent (week scope; see plan addendum);
// Execution Quality renders the awaiting-intraday placeholder like the day tab.
export default function WeekPerformanceTab({ detail }: { detail: WeekDetail }) {
  const m = detail.metrics

  if (m.tradeCount === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades this week.
      </div>
    )
  }

  const greenPct = m.tradingDays > 0 ? (m.greenDays / m.tradingDays) * 100 : 0
  // Largest swing = best day − worst day. Only meaningful when BOTH endpoints
  // exist; an all-green week (worstDay null) yields null → dash, never NaN.
  const largestSwing = m.bestDay && m.worstDay ? m.bestDay.netPnl - m.worstDay.netPnl : null

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
        { label: 'Avg trade P&L', value: <Signed value={m.netPnl / m.tradeCount} /> },
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
        { label: 'Notional volume', value: <span className="font-mono text-fg-primary">{money(m.totalDollarVolume)}</span> },
        {
          label: 'Profit factor',
          value: <span className="font-mono text-gold">{formatProfitFactor(m.profitFactor)}</span>,
          hint:
            m.profitFactor === Infinity
              ? 'No losing trades — profit factor is undefined (winning-only week).'
              : 'Gross wins ÷ |gross losses|.',
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
          value: m.avgRMultiple == null ? <Dash /> : <span className="font-mono text-fg-primary">{m.avgRMultiple.toFixed(2)}R</span>,
          hint: m.avgRMultiple == null ? 'No trades have a planned risk set.' : undefined,
        },
      ],
    },
    {
      title: 'Counts',
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
      ],
    },
    {
      title: 'Consistency',
      rows: [
        {
          label: 'Green days',
          value: (
            <span className="font-mono text-fg-primary">
              {int(m.greenDays)}/{int(m.tradingDays)}{' '}
              <span className="text-fg-tertiary">({greenPct.toFixed(0)}%)</span>
            </span>
          ),
        },
        {
          label: 'Day P&L std dev',
          value: m.dayPnlStdDev == null ? <Dash /> : <span className="font-mono text-fg-primary">{money(m.dayPnlStdDev)}</span>,
          hint: m.dayPnlStdDev == null ? 'Needs at least 3 trading days.' : 'Sample std dev of per-day net P&L.',
        },
        {
          label: 'Largest swing',
          value: largestSwing == null ? <Dash /> : <span className="font-mono text-fg-primary">{money(largestSwing)}</span>,
          hint: largestSwing == null ? 'Needs both a green and a red day.' : 'Best day minus worst day.',
        },
        { label: 'Best day', value: m.bestDay ? <DayValue date={m.bestDay.date} pnl={m.bestDay.netPnl} /> : <Dash /> },
        { label: 'Worst day', value: m.worstDay ? <DayValue date={m.worstDay.date} pnl={m.worstDay.netPnl} /> : <Dash /> },
        {
          label: 'Streak into next week',
          value:
            m.streak.kind === 'none' ? (
              <Dash />
            ) : (
              <span className={`font-mono font-semibold ${m.streak.kind === 'win' ? 'text-win' : 'text-loss'}`}>
                {m.streak.days}-day {m.streak.kind}
              </span>
            ),
        },
      ],
    },
    {
      title: 'Per-playbook',
      rows:
        m.perPlaybook.length === 0
          ? [{ label: 'No playbooks tagged this week.', value: null }]
          : m.perPlaybook.map((p) => ({
              label: p.playbook,
              value: (
                <span className="font-mono">
                  <span className={`font-semibold ${pnlClass(p.netPnl)}`}>{signed(p.netPnl)}</span>
                  <span className="ml-2 text-xs text-fg-tertiary">
                    {int(p.tradeCount)}× · {p.winRate == null ? '—' : `${(p.winRate * 100).toFixed(0)}%`} WR
                  </span>
                </span>
              ),
            })),
    },
    {
      title: 'Execution quality',
      rows: [
        { label: 'Avg MFE', value: <Awaiting />, hint: 'Max Favorable Excursion — requires intraday market data.' },
        { label: 'Avg MAE', value: <Awaiting />, hint: 'Max Adverse Excursion — requires intraday market data.' },
        { label: 'Money left on table', value: <Awaiting />, hint: 'Sum of per-trade best-exit gap — requires intraday market data.' },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <DayByDayCard m={m} />

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-md border border-border-subtle/60 bg-bg-2">
            <div className="border-b border-border-subtle/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gold">
              {section.title}
            </div>
            <dl>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border-subtle/30 px-4 py-2 last:border-b-0"
                >
                  <dt className="min-w-0 text-sm text-fg-secondary" title={row.hint}>
                    {row.label}
                  </dt>
                  {row.value !== null && <dd className="shrink-0 text-right tnum">{row.value}</dd>}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="px-1 text-[11px] text-fg-tertiary">
        Multi-day system-quality stats (SQN, K-Ratio) live in Deep Analytics → Performance.
      </p>
    </div>
  )
}

// ── Day-by-day P&L ──────────────────────────────────────────────────────────
// Diverging horizontal bars, one row per traded day (chronological Sun→Sat).
// Bars scale to the largest |net| of the week; best/worst day badged.
function DayByDayCard({ m }: { m: WeekMetrics }) {
  const maxAbs = m.dayByDay.reduce((max, d) => Math.max(max, Math.abs(d.netPnl)), 0)
  return (
    <Card title="Day-by-day P&L" subtitle="Which days carried the week.">
      <div className="space-y-1">
        {m.dayByDay.map((d) => {
          const isBest = m.bestDay?.date === d.date
          const isWorst = m.worstDay?.date === d.date
          const pct = maxAbs > 0 ? (Math.abs(d.netPnl) / maxAbs) * 100 : 0
          return (
            <div key={d.date} className="flex items-center gap-3 py-1">
              <div className="w-24 shrink-0 text-sm">
                <span className="font-medium text-fg-secondary">{weekdayOf(d.date)}</span>{' '}
                <span className="text-fg-tertiary">{shortDate(d.date)}</span>
              </div>
              <div className="w-16 shrink-0 text-right font-mono text-xs text-fg-tertiary tnum">
                {int(d.tradeCount)} {d.tradeCount === 1 ? 'trade' : 'trades'}
              </div>
              <div className="flex min-w-0 flex-1 items-center">
                <div className="flex w-1/2 justify-end">
                  {d.netPnl < 0 && (
                    <div className="h-4 rounded-l bg-loss/70" style={{ width: `${pct}%` }} />
                  )}
                </div>
                <div className="h-4 w-px shrink-0 bg-border-subtle" />
                <div className="flex w-1/2 justify-start">
                  {d.netPnl > 0 && (
                    <div className="h-4 rounded-r bg-win/70" style={{ width: `${pct}%` }} />
                  )}
                </div>
              </div>
              <div className={`w-24 shrink-0 text-right font-mono text-sm font-semibold tnum ${pnlClass(d.netPnl)}`}>
                {signed(d.netPnl)}
              </div>
              <div className="w-14 shrink-0 text-left">
                {isBest && <Badge tone="win">Best</Badge>}
                {isWorst && <Badge tone="loss">Worst</Badge>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Weekday name for a YYYY-MM-DD trading-day string. Built from UTC so the
// label is TZ-independent — the date carries no clock component.
function weekdayOf(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  if (!y || !mo || !d) return ''
  return WEEKDAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
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

function DayValue({ date, pnl }: { date: string; pnl: number }) {
  return (
    <span className="font-mono">
      <span className="text-fg-primary">{shortDate(date)}</span>{' '}
      <span className={pnlClass(pnl)}>{signed(pnl)}</span>
    </span>
  )
}

function Badge({ tone, children }: { tone: 'win' | 'loss'; children: ReactNode }) {
  const cls = tone === 'win' ? 'border-win/40 text-win' : 'border-loss/40 text-loss'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  )
}

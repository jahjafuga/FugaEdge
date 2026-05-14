import type { FullStats } from '@shared/reports-types'
import { duration, int, money, pnlClass, signed } from '@/lib/format'

interface FullStatsTableProps {
  stats: FullStats
}

interface Row {
  label: string
  value: React.ReactNode
  hint?: string
}

interface Section {
  title: string
  rows: Row[]
}

const DASH = '—'

function pf(n: number | null): string {
  if (n == null) return DASH
  if (!Number.isFinite(n)) return '∞'
  return n.toFixed(2)
}

function sqnLabel(n: number | null): string {
  if (n == null) return ''
  if (n < 1.6) return 'poor'
  if (n < 2.0) return 'below avg'
  if (n < 2.5) return 'avg'
  if (n < 3.0) return 'good'
  if (n < 5.0) return 'excellent'
  if (n < 7.0) return 'superb'
  return 'holy grail'
}

export default function FullStatsTable({ stats }: FullStatsTableProps) {
  const sections: Section[] = [
    {
      title: 'P&L',
      rows: [
        {
          label: 'Average trade P&L',
          value: <Money value={stats.avg_trade_pnl} signed />,
        },
        {
          label: 'Average daily P&L',
          value: <Money value={stats.avg_daily_pnl} signed />,
        },
        {
          label: 'Trade P&L standard deviation',
          value: <Money value={stats.std_dev_pnl} />,
          hint: 'Sample std dev across trades.',
        },
        {
          label: 'Profit factor',
          value: (
            <span className="font-mono text-gold">{pf(stats.profit_factor)}</span>
          ),
          hint: 'Gross wins / |gross losses|. N/A when no losing trades.',
        },
      ],
    },
    {
      title: 'Counts',
      rows: [
        { label: 'Total trades', value: <Mono>{int(stats.trade_count)}</Mono> },
        { label: 'Winning trades', value: <span className="font-mono text-win">{int(stats.winners)}</span> },
        { label: 'Losing trades', value: <span className="font-mono text-loss">{int(stats.losers)}</span> },
        {
          label: 'Scratch trades',
          value: <span className="font-mono text-fg-tertiary">{int(stats.scratches)}</span>,
          hint: 'P&L between −$2 and +$2.',
        },
        { label: 'Trading days', value: <Mono>{int(stats.trading_days)}</Mono> },
      ],
    },
    {
      title: 'Hold time',
      rows: [
        {
          label: 'Average hold (all)',
          value: <Mono>{duration(stats.avg_hold_seconds)}</Mono>,
        },
        {
          label: 'Average hold (winners)',
          value: <span className="font-mono text-win">{duration(stats.avg_hold_seconds_winners)}</span>,
        },
        {
          label: 'Average hold (losers)',
          value: <span className="font-mono text-loss">{duration(stats.avg_hold_seconds_losers)}</span>,
        },
        {
          label: 'Average hold (scratches)',
          value: <span className="font-mono text-fg-tertiary">{duration(stats.avg_hold_seconds_scratches)}</span>,
        },
      ],
    },
    {
      title: 'Streaks',
      rows: [
        {
          label: 'Max consecutive wins',
          value: <span className="font-mono text-win">{int(stats.max_consecutive_wins)}</span>,
        },
        {
          label: 'Max consecutive losses',
          value: <span className="font-mono text-loss">{int(stats.max_consecutive_losses)}</span>,
        },
      ],
    },
    {
      title: 'System quality',
      rows: [
        {
          label: 'Kelly %',
          value: (
            <span className={`font-mono ${pnlClass(stats.kelly_pct ?? 0)}`}>
              {stats.kelly_pct == null
                ? DASH
                : `${stats.kelly_pct >= 0 ? '+' : ''}${stats.kelly_pct.toFixed(1)}%`}
            </span>
          ),
          hint:
            '(Win rate − Loss rate × |avg loss| / avg win) × 100. Negative means edge favors not trading.',
        },
        {
          label: 'System Quality Number (SQN)',
          value: (
            <span className="font-mono text-gold">
              {stats.sqn == null ? DASH : stats.sqn.toFixed(2)}
              {stats.sqn != null && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
                  {sqnLabel(stats.sqn)}
                </span>
              )}
            </span>
          ),
          hint:
            '(Avg trade P&L / std dev) × √N. >2 is profitable, >3 excellent.',
        },
      ],
    },
    {
      title: 'Execution quality',
      rows: [
        {
          label: 'Average MAE',
          value: <Mono>{DASH}</Mono>,
          hint:
            'Maximum Adverse Excursion. Requires intraday market data — not available from execution-only imports.',
        },
        {
          label: 'Average MFE',
          value: <Mono>{DASH}</Mono>,
          hint:
            'Maximum Favorable Excursion. Requires intraday market data — not available from execution-only imports.',
        },
      ],
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
      {sections.map((section) => (
        <div key={section.title} className="rounded-md border border-border-subtle/40 bg-bg-1/30">
          <div className="border-b border-border-subtle/40 px-4 py-2 text-[10px] uppercase tracking-wider text-gold">
            {section.title}
          </div>
          <dl>
            {section.rows.map((row, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-4 border-b border-border-subtle/20 px-4 py-2 last:border-b-0"
              >
                <dt className="text-sm text-fg-secondary" title={row.hint}>
                  {row.label}
                  {row.hint && (
                    <span className="ml-1 cursor-help text-[10px] text-fg-tertiary">ⓘ</span>
                  )}
                </dt>
                <dd className="text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-fg-primary">{children}</span>
}

function Money({ value, signed: showSign }: { value: number | null; signed?: boolean }) {
  if (value == null) return <span className="font-mono text-fg-tertiary">{DASH}</span>
  if (showSign) {
    return <span className={`font-mono font-medium ${pnlClass(value)}`}>{signed(value)}</span>
  }
  return <span className="font-mono text-fg-primary">{money(value)}</span>
}

import type { OverviewStats } from '@shared/dashboard-types'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { money, int, signed, pnlClass } from '@/lib/format'

interface KpiStripProps {
  overview: OverviewStats
}

type Tone = 'auto' | 'gold' | 'red' | 'green' | 'neutral'
type Fmt = (n: number | null) => string

interface Kpi {
  label: string
  value: number | null
  format: Fmt
  tone: Tone
}

const DASH = '—'
const NA = 'N/A'

const moneyOrDash: Fmt = (n) => (n === null ? DASH : money(n))
const signedOrDash: Fmt = (n) => (n === null ? DASH : signed(n))
const pctOrDash: Fmt = (n) => (n === null ? DASH : `${n.toFixed(1)}%`)
const pfFormat: Fmt = (n) => {
  if (n === null) return NA
  if (!Number.isFinite(n)) return '∞'
  return n.toFixed(2)
}
const intCount: Fmt = (n) => (n === null ? DASH : int(Math.round(n)))

export default function KpiStrip({ overview }: KpiStripProps) {
  const winRatePct = overview.win_rate === null ? null : overview.win_rate * 100

  const items: Kpi[] = [
    { label: 'Net P&L',         value: overview.net_pnl,        format: signedOrDash, tone: 'auto' },
    { label: 'Gross P&L',       value: overview.gross_pnl,      format: signedOrDash, tone: 'auto' },
    { label: 'Total fees',      value: overview.total_fees,     format: moneyOrDash,  tone: 'red' },
    { label: 'Trade count',     value: overview.trade_count,    format: intCount,     tone: 'neutral' },
    { label: 'Win rate',        value: winRatePct,              format: pctOrDash,    tone: 'gold' },
    { label: 'Profit factor',   value: overview.profit_factor,  format: pfFormat,     tone: 'gold' },
    { label: 'Avg winner',      value: overview.avg_winner,     format: moneyOrDash,  tone: 'green' },
    { label: 'Avg loser',       value: overview.avg_loser,      format: moneyOrDash,  tone: 'red' },
    { label: 'Largest winner',  value: overview.largest_winner, format: moneyOrDash,  tone: 'green' },
    { label: 'Largest loser',   value: overview.largest_loser,  format: moneyOrDash,  tone: 'red' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((k) => (
        <KpiCard key={k.label} kpi={k} />
      ))}
    </div>
  )
}

// MASTER §5.6 — KPI tile. Solid bg-2 card, 16px padding, mono value 28/32.
// Hover only border tint — no scale, no glow.
function KpiCard({ kpi }: { kpi: Kpi }) {
  const color =
    kpi.value === null
      ? 'text-fg-muted'
      : kpi.tone === 'gold'
        ? 'text-gold'
        : kpi.tone === 'green'
          ? 'text-win'
          : kpi.tone === 'red'
            ? 'text-loss'
            : kpi.tone === 'neutral'
              ? 'text-fg-primary'
              : pnlClass(kpi.value)
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-4 shadow-sm transition-colors duration-150 ease-out-soft hover:border-border">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
        {kpi.label}
      </div>
      <div
        className={`mt-1.5 font-mono font-semibold tnum ${color}`}
        style={{ fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1.15 }}
      >
        <AnimatedNumber value={kpi.value} format={kpi.format} />
      </div>
    </div>
  )
}

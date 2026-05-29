import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { money, int, percent, signed, pnlClass } from '@/lib/format'

// Shared KPI stat strip — the dashboard's KpiStrip, the Day Detail Overview,
// and the Week Review Overview all render the same card grid through this so
// the markup lives in one place. Each surface builds its own Kpi[] (the card
// SET can differ per surface) and passes it in.

export type Tone = 'auto' | 'gold' | 'red' | 'green' | 'neutral'
export type Fmt = (n: number | null) => string

export interface Kpi {
  label: string
  value: number | null
  format: Fmt
  tone: Tone
}

const DASH = '—'

export const moneyOrDash: Fmt = (n) => (n === null ? DASH : money(n))
export const signedOrDash: Fmt = (n) => (n === null ? DASH : signed(n))
export const pctOrDash: Fmt = (n) => (n === null ? DASH : percent(n, 1))
export const intCount: Fmt = (n) => (n === null ? DASH : int(Math.round(n)))

export default function StatStrip({ items }: { items: Kpi[] }) {
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
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
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

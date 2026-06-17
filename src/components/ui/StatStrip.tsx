import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { money, int, percent, signed, pnlClass } from '@/lib/format'

// Shared KPI stat strip — the dashboard's KpiStrip, the Day Detail Overview,
// and the Week Review Overview all render the same card grid through this so
// the markup lives in one place. Each surface builds its own Kpi[] (the card
// SET can differ per surface) and passes it in.

export type Tone = 'auto' | 'gold' | 'red' | 'green' | 'neutral'
export type Fmt = (n: number | null) => string

/** Surface treatment. 'plain' is the shared default (Day Detail, Week Review).
 *  'premium' is the dashboard-only distinguished treatment — a faint gold frame
 *  + a fading gold top hairline + gold hover — opted into by KpiStrip alone. */
export type StatStripVariant = 'plain' | 'premium'

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

export default function StatStrip({
  items,
  variant = 'plain',
}: {
  items: Kpi[]
  variant?: StatStripVariant
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((k) => (
        <KpiCard key={k.label} kpi={k} variant={variant} />
      ))}
    </div>
  )
}

// MASTER §5.6 — KPI tile. Solid bg-2 card, 16px padding, mono value 28/32.
// Hover only border tint — no scale, no glow. The dashboard opts into the
// 'premium' variant (a faint gold frame + a fading gold top hairline + gold
// hover) to distinguish its strip from the shared plain tiles without going full
// card-premium — 10 dense premium cards would read heavy. The 'plain' class is
// byte-identical to before, so Day Detail + Week Review (which omit the prop)
// are unchanged.
function KpiCard({ kpi, variant }: { kpi: Kpi; variant: StatStripVariant }) {
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
  const cardClass =
    variant === 'premium'
      ? "relative overflow-hidden rounded-lg border border-gold/15 bg-bg-2 p-4 shadow-sm transition-colors duration-150 ease-out-soft hover:border-gold/40 before:content-[''] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/50 before:to-transparent"
      : 'rounded-lg border border-border-subtle bg-bg-2 p-4 shadow-sm transition-colors duration-150 ease-out-soft hover:border-border'
  return (
    <div className={cardClass}>
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

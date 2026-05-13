import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'red' | 'green' | 'gold' | 'neutral'
}

export default function KpiCard({ label, value, detail, tone = 'neutral' }: KpiCardProps) {
  const color =
    tone === 'red'
      ? 'text-loss'
      : tone === 'green'
        ? 'text-win'
        : tone === 'gold'
          ? 'text-gold'
          : 'text-fg-primary'

  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 px-4 py-3 transition-colors duration-150 hover:border-border-subtle/80">
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">{label}</div>
      <div className={`mt-1 font-mono text-xl font-medium tracking-tight ${color}`}>
        {value}
      </div>
      {detail && (
        <div className="mt-1 font-mono text-[11px] text-fg-tertiary">{detail}</div>
      )}
    </div>
  )
}

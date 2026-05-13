import { Table2, BarChart3, LayoutGrid, type LucideIcon } from 'lucide-react'

export type TradesView = 'table' | 'charts-large' | 'charts-small'

interface TradesViewToggleProps {
  value: TradesView
  onChange: (next: TradesView) => void
}

const OPTIONS: { key: TradesView; label: string; Icon: LucideIcon }[] = [
  { key: 'table',        label: 'Table',  Icon: Table2 },
  { key: 'charts-large', label: 'Charts', Icon: BarChart3 },
  { key: 'charts-small', label: 'Grid',   Icon: LayoutGrid },
]

export default function TradesViewToggle({ value, onChange }: TradesViewToggleProps) {
  return (
    <div role="tablist" className="inline-flex items-center rounded-md border border-border-subtle bg-bg-2 p-0.5">
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = key === value
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            title={label}
            className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-3 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 ease-out-soft ${
              active
                ? 'bg-gold text-accent-ink'
                : 'text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

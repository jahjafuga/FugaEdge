import { Table2, BarChart3, LayoutGrid, type LucideIcon } from 'lucide-react'
import { viewControlIdle, viewControlOn } from '@/components/trades/viewControlClasses'

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
    // No container chrome: each segment carries its own border and surface now, so
    // a box around them would be a box inside a box. The tablist role still groups
    // them semantically, and the gap does it visually.
    <div role="tablist" className="inline-flex items-center gap-1.5">
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
            className={active ? viewControlOn : viewControlIdle}
          >
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

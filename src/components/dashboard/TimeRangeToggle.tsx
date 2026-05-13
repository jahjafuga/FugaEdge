import type { TimeRange } from '@shared/dashboard-types'

interface TimeRangeToggleProps {
  value: TimeRange
  onChange: (next: TimeRange) => void
}

const OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '60d', label: '60D' },
  { key: '90d', label: '90D' },
  { key: 'all', label: 'ALL' },
]

// MASTER §5 — solid gold active pill, no gradient. 150ms color transition.
export default function TimeRangeToggle({ value, onChange }: TimeRangeToggleProps) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center rounded-md border border-border-subtle bg-bg-2 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={`cursor-pointer rounded-[6px] px-3 py-1 font-mono text-[11px] font-semibold tracking-wider transition-colors duration-150 ease-out-soft ${
              active
                ? 'bg-gold text-accent-ink'
                : 'text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

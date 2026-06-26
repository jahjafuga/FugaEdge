import type { EntryTimeframe } from '@shared/trades-types'

interface TimeframePickerProps {
  value: EntryTimeframe | null
  onChange: (next: EntryTimeframe | null) => void
}

const OPTIONS: { key: EntryTimeframe; label: string }[] = [
  { key: '10s', label: '10s' },
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
]

export default function TimeframePicker({ value, onChange }: TimeframePickerProps) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(active ? null : opt.key)}
              className={`flex h-9 flex-1 items-center justify-center rounded-md border font-mono text-sm transition-all duration-150 ease-smooth ${
                active
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-border text-subtle hover:border-gold/60 hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-text"
        >
          clear
        </button>
      )}
    </div>
  )
}

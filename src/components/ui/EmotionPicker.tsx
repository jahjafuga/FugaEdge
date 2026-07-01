interface EmotionPickerProps {
  value: number | null
  onChange: (next: number | null) => void
}

const LABELS = ['Awful', 'Poor', 'OK', 'Good', 'Great']

export default function EmotionPicker({ value, onChange }: EmotionPickerProps) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n
        return (
          <button
            key={n}
            type="button"
            title={LABELS[n - 1]}
            onClick={() => onChange(active ? null : n)}
            className={`flex h-7 w-7 items-center justify-center rounded border font-mono text-xs transition-all duration-150 ease-smooth ${
              active
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-border text-fg-tertiary hover:border-gold/60 hover:text-fg-primary'
            }`}
          >
            {n}
          </button>
        )
      })}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-fg-primary"
        >
          clear
        </button>
      )}
    </div>
  )
}

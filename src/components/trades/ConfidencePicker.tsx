interface ConfidencePickerProps {
  value: number | null
  onChange: (next: number | null) => void
}

// 5 gold dots. Click dot N to set value to N. Click the already-active dot
// (or the "clear" link) to unset.
export default function ConfidencePicker({ value, onChange }: ConfidencePickerProps) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value
        const isActive = value === n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(isActive ? null : n)}
            title={`${n} ${n === 1 ? 'dot' : 'dots'}`}
            className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 ease-smooth ${
              filled
                ? 'text-gold hover:scale-110'
                : 'text-gold/15 hover:text-gold/40'
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                background: 'currentColor',
                boxShadow: filled
                  ? '0 0 8px rgba(212,175,55,0.45)'
                  : undefined,
              }}
            />
          </button>
        )
      })}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-text"
        >
          clear
        </button>
      )}
    </div>
  )
}

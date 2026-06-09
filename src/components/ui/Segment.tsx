// Segmented control — pill-style single-select toggle. Extracted from the
// Reports Overview FilterBar so it can be reused across filter bars.
// Presentational only.

export default function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-border-strong bg-bg-1 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-7 cursor-pointer rounded px-2 text-[10px] uppercase tracking-wider transition-colors duration-150 ${
              active
                ? 'bg-gold/15 text-gold'
                : 'text-fg-tertiary hover:text-fg-primary'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

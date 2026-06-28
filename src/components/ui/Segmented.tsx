// Generic segmented toggle — an inline pill group, one active option in gold.
// Extracted from TradesFilters (the Side / Duration toggles) so other surfaces
// (e.g. the bulk-mistakes Add/Remove mode toggle) can reuse it unchanged.
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" className="inline-flex h-8 rounded-md border border-border-subtle bg-bg-1 p-0.5">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`cursor-pointer rounded-[5px] px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
              active ? 'bg-gold text-accent-ink' : 'text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

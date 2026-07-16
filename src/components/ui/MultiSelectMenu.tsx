import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

// Shared multi-select dropdown pill. EXTRACTED from AnalyticsFilterBar
// (Dave #14 A) so the Analytics Compare tab's mistake picker reuses it
// instead of growing a third clone — the component body is byte-identical
// to the bar's old private copy (itself a local copy of the retired
// Reports FilterBar popover). Lightweight click-to-open; native
// <select multiple> is unusable for a polished bar.

export default function MultiSelectMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt))
    else onChange([...selected, opt])
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] uppercase tracking-wider transition-colors duration-150 ${
          selected.length > 0
            ? 'border-gold/50 bg-gold/[0.08] text-gold'
            : 'border-border-strong bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-sm bg-gold/20 px-1 text-[9px]">{selected.length}</span>
        )}
        <ChevronDown size={12} strokeWidth={2} />
      </button>
      {open && (
        <>
          {/* Click-away catcher */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-72 min-w-[180px] overflow-y-auto rounded-md border border-border-strong bg-bg-2 p-1 shadow-lg">
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-fg-tertiary">No options yet.</div>
            ) : (
              options.map((opt) => {
                const checked = selected.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                      checked ? 'bg-gold/[0.08] text-gold' : 'text-fg-secondary hover:bg-bg-3'
                    }`}
                  >
                    <span
                      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${
                        checked ? 'border-gold bg-gold' : 'border-border-strong'
                      }`}
                    >
                      {checked && <X size={9} strokeWidth={3} className="text-accent-ink" />}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                )
              })
            )}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-1 w-full cursor-pointer rounded px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-fg-tertiary hover:text-gold"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

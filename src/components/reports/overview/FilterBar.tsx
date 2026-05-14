import { useMemo, useState } from 'react'
import { ChevronDown, GitCompareArrows, RotateCcw, X } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import {
  distinctCatalysts,
  distinctMistakes,
  distinctPlaybooks,
  emptyFilters,
  rangeForQuick,
  type DurationBucket,
  type OverviewFilters,
  type QuickRange,
  type SideFilter,
} from '@/core/performance'

interface FilterBarProps {
  trades: TradeListRow[]
  filters: OverviewFilters
  onFiltersChange: (next: OverviewFilters) => void
  quick: QuickRange
  onQuickChange: (q: QuickRange) => void
  compareOn: boolean
  onToggleCompare: () => void
}

const SIDES: { value: SideFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]

const DURATIONS: { value: DurationBucket; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'under-1m', label: '<1m' },
  { value: '1-5m', label: '1-5m' },
  { value: '5-30m', label: '5-30m' },
  { value: 'over-30m', label: '>30m' },
]

const QUICK: { value: QuickRange; label: string }[] = [
  { value: '30d', label: '30D' },
  { value: '60d', label: '60D' },
  { value: '90d', label: '90D' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
]

export default function FilterBar({
  trades,
  filters,
  onFiltersChange,
  quick,
  onQuickChange,
  compareOn,
  onToggleCompare,
}: FilterBarProps) {
  const playbookOptions = useMemo(() => distinctPlaybooks(trades), [trades])
  const catalystOptions = useMemo(() => distinctCatalysts(trades), [trades])
  const mistakeOptions = useMemo(() => distinctMistakes(trades), [trades])

  const set = <K extends keyof OverviewFilters>(key: K, value: OverviewFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const handleQuick = (q: QuickRange) => {
    onQuickChange(q)
    set('range', rangeForQuick(q))
  }

  const reset = () => {
    onFiltersChange(emptyFilters())
    onQuickChange('90d')
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border-subtle bg-bg-1/95 px-4 py-3 font-sans backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {/* Symbol */}
        <input
          type="text"
          value={filters.symbol}
          onChange={(e) => set('symbol', e.target.value)}
          placeholder="Symbol"
          className="h-8 w-28 rounded-md border border-border-strong bg-bg-1 px-2.5 text-xs text-fg-primary placeholder:text-fg-tertiary focus:border-gold focus:outline-none"
        />

        {/* Side segment */}
        <Segment
          options={SIDES}
          value={filters.side}
          onChange={(v) => set('side', v)}
        />

        {/* Duration segment */}
        <Segment
          options={DURATIONS}
          value={filters.duration}
          onChange={(v) => set('duration', v)}
        />

        {/* Tag multi-selects */}
        <MultiSelectMenu
          label="Playbook"
          options={playbookOptions}
          selected={filters.playbooks}
          onChange={(next) => set('playbooks', next)}
        />
        <MultiSelectMenu
          label="Catalyst"
          options={catalystOptions}
          selected={filters.catalysts}
          onChange={(next) => set('catalysts', next)}
        />
        <MultiSelectMenu
          label="Mistake"
          options={mistakeOptions}
          selected={filters.mistakes}
          onChange={(next) => set('mistakes', next)}
        />

        {/* Date range */}
        <div className="flex items-center gap-1">
          <DateField
            label="From"
            value={filters.range?.from ?? ''}
            onChange={(v) =>
              set('range', v ? { from: v, to: filters.range?.to ?? v } : null)
            }
          />
          <DateField
            label="To"
            value={filters.range?.to ?? ''}
            onChange={(v) =>
              set('range', v ? { from: filters.range?.from ?? v, to: v } : null)
            }
          />
        </div>

        {/* Quick range */}
        <Segment options={QUICK} value={quick} onChange={handleQuick} />

        {/* Reset */}
        <button
          type="button"
          onClick={reset}
          title="Reset all filters"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-2.5 text-[10px] uppercase tracking-widest text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <RotateCcw size={12} strokeWidth={2} />
          Reset
        </button>

        {/* Compare toggle */}
        <button
          type="button"
          onClick={onToggleCompare}
          aria-pressed={compareOn}
          className={`ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[10px] font-semibold uppercase tracking-widest transition-colors duration-150 ${
            compareOn
              ? 'border-gold/60 bg-gold/[0.12] text-gold'
              : 'border-border-strong bg-bg-1 text-fg-secondary hover:border-gold/40 hover:text-gold'
          }`}
        >
          <GitCompareArrows size={12} strokeWidth={2} />
          Compare periods
        </button>
      </div>
    </div>
  )
}

// ── Segmented control ─────────────────────────────────────────────────────

function Segment<T extends string>({
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
            className={`h-7 cursor-pointer rounded px-2 text-[10px] uppercase tracking-widest transition-colors duration-150 ${
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

// ── Multi-select dropdown ─────────────────────────────────────────────────
//
// Lightweight click-to-open popover. Native <select multiple> is unusable
// for a polished bar, and we don't want to pull a heavier headless lib.

function MultiSelectMenu({
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
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] uppercase tracking-widest transition-colors duration-150 ${
          selected.length > 0
            ? 'border-gold/50 bg-gold/[0.08] text-gold'
            : 'border-border-strong bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-sm bg-gold/20 px-1 text-[9px]">
            {selected.length}
          </span>
        )}
        <ChevronDown size={12} strokeWidth={2} />
      </button>
      {open && (
        <>
          {/* Click-away catcher */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-72 min-w-[180px] overflow-y-auto rounded-md border border-border-strong bg-bg-2 p-1 shadow-lg">
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-fg-tertiary">
                No options yet.
              </div>
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
                className="mt-1 w-full cursor-pointer rounded px-2 py-1.5 text-left text-[10px] uppercase tracking-widest text-fg-tertiary hover:text-gold"
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

// ── Date field ────────────────────────────────────────────────────────────

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 text-[10px] uppercase tracking-widest text-fg-tertiary">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 bg-transparent px-1 text-xs text-fg-primary focus:outline-none"
      />
    </label>
  )
}

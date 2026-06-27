import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import type { PlaybookWithStats } from '@shared/playbook-types'
import { ipc } from '@/lib/ipc'
import TierBadge from '@/components/playbook/TierBadge'
import SystemTierChip from '@/components/playbook/SystemTierChip'
import {
  emptyFilters,
  isFiltering,
  type SideFilter,
  type DurationFilter,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'

const SIDE_OPTS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
]

const DURATION_OPTS: { key: DurationFilter; label: string }[] = [
  { key: 'all', label: 'Any duration' },
  { key: 'under1m', label: '< 1m' },
  { key: '1to5m', label: '1–5m' },
  { key: '5to30m', label: '5–30m' },
  { key: 'over30m', label: '> 30m' },
]

interface TradesFiltersProps {
  filters: TradesFilterState
  onChange: (next: TradesFilterState) => void
  trades: TradeListRow[]
}

export default function TradesFilters({ filters, onChange, trades: _trades }: TradesFiltersProps) {
  const filtering = isFiltering(filters)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-bg-1 px-2.5 transition-colors duration-150 focus-within:border-gold">
          <Search size={14} strokeWidth={1.75} className="text-fg-tertiary" />
          <input
            value={filters.symbol}
            onChange={(e) => onChange({ ...filters, symbol: e.target.value })}
            placeholder="Symbol"
            className="w-24 bg-transparent text-sm uppercase text-fg-primary placeholder:text-fg-muted focus:outline-none"
          />
          {filters.symbol && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, symbol: '' })}
              className="cursor-pointer text-fg-muted hover:text-fg-secondary"
              aria-label="Clear symbol"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <Segmented
          options={SIDE_OPTS}
          value={filters.side}
          onChange={(v) => onChange({ ...filters, side: v })}
        />

        <Segmented
          options={DURATION_OPTS}
          value={filters.duration}
          onChange={(v) => onChange({ ...filters, duration: v })}
        />

        <PlaybookFilterDropdown
          selected={filters.playbookIds}
          onChange={(next) => onChange({ ...filters, playbookIds: next })}
        />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            From
          </span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="h-8 cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            To
          </span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="h-8 cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          />
        </div>

        {filtering && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters())}
            className="ml-auto inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
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

// Multi-select PRIMARY-playbook filter. Bespoke (there's no shared dropdown
// primitive): the SHELL mirrors ChartTab's IndicatorsDropdown — stay-open on
// toggle, click-outside (mousedown) + Escape to close, a selected-count badge —
// and the ROWS mirror PlaybookPicker (TierBadge / SystemTierChip, system rows
// pinned to the top, archived excluded). A `null` entry is the "No playbook"
// bucket (truly-untagged trades), rendered as a distinct top row SEPARATE from
// the seeded "No Setup" system playbook (a normal selectable id). Trigger height
// matches the filter bar (h-8 bg-bg-1), not the chart toolbar (h-7 bg-bg-2).
function PlaybookFilterDropdown({
  selected,
  onChange,
}: {
  selected: (number | null)[]
  onChange: (next: (number | null)[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [playbooks, setPlaybooks] = useState<PlaybookWithStats[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Lazy-load the catalog on first open; cache in state so re-opening never refetches.
  useEffect(() => {
    if (!open || playbooks) return
    let cancelled = false
    ipc.playbooksList().then((list) => {
      if (!cancelled) setPlaybooks(list)
    })
    return () => {
      cancelled = true
    }
  }, [open, playbooks])

  // Click-outside + Escape close it; toggling a row leaves it open (multi-select).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = selected.length
  const active = count > 0

  const toggle = (id: number | null) => {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    )
  }

  const visible = (playbooks ?? []).filter((p) => !p.archived)
  const system = visible.filter((p) => p.is_system)
  const users = visible.filter((p) => !p.is_system)
  const noPlaybookSelected = selected.includes(null)

  const renderRow = (p: PlaybookWithStats) => {
    const checked = selected.includes(p.id)
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggle(p.id)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
          checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
        }`}
      >
        <FilterCheckbox checked={checked} />
        {p.is_system ? <SystemTierChip /> : <TierBadge tier={p.tier} />}
        <span className="truncate">{p.name}</span>
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Filter by playbook"
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
          active
            ? 'border-gold/40 text-fg-primary'
            : 'border-border-subtle text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        Playbook
        {active && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold px-1 text-[9px] text-accent-ink">
            {count}
          </span>
        )}
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-[280px] w-[240px] overflow-auto rounded-md border border-border-subtle bg-bg-3 p-2 shadow-lg">
          {/* Truly-untagged bucket — distinct from the "No Setup" system playbook. */}
          <button
            type="button"
            onClick={() => toggle(null)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
              noPlaybookSelected
                ? 'bg-white/[0.04] text-fg-primary'
                : 'text-fg-tertiary hover:bg-white/[0.04]'
            }`}
          >
            <FilterCheckbox checked={noPlaybookSelected} />
            <span className="italic">No playbook</span>
          </button>

          <div className="my-1 h-px bg-border-subtle" />

          {!playbooks && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">Loading…</div>
          )}

          {playbooks && (
            <>
              {system.map(renderRow)}
              {system.length > 0 && users.length > 0 && (
                <div className="my-1 h-px bg-border-subtle" />
              )}
              {users.map(renderRow)}
              {visible.length === 0 && (
                <div className="px-2 py-2 text-[10px] text-fg-muted">No playbooks</div>
              )}
            </>
          )}

          {active && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
              >
                Clear playbooks
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FilterCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 ${
        checked ? 'border-gold bg-gold text-accent-ink' : 'border-border'
      }`}
    >
      {checked && <Check size={10} strokeWidth={3} />}
    </span>
  )
}

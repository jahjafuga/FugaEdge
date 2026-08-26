import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import type { PlaybookWithStats } from '@shared/playbook-types'
import type { MistakeAxis, MistakeDef } from '@shared/mistakes-types'
import type { CatalystDef } from '@shared/catalyst-types'
import { ipc } from '@/lib/ipc'
import TierBadge from '@/components/playbook/TierBadge'
import SystemTierChip from '@/components/playbook/SystemTierChip'
import ExcludeChip from '@/components/trades/ExcludeChip'
import { excludeChips, removeExcluded } from '@/core/trades/excludeChips'
import Segmented from '@/components/ui/Segmented'
import { withManualDate } from '@/core/trades/datePreset'
import {
  emptyFilters,
  isFiltering,
  type DnaFilterAsk,
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
  /** The numeric columns the user has CHOSEN to filter on — not the ones the
   *  table happens to be showing, which is a separate question and was the
   *  premise the ungate beat retired. Supplied by the page, which owns the
   *  chooser. Empty renders no strip at all, which is a fresh profile. */
  numericColumns?: { id: string; label: string }[]
}

export default function TradesFilters({
  filters,
  onChange,
  trades,
  numericColumns = [],
}: TradesFiltersProps) {
  const setRange = (id: string, key: 'min' | 'max', raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw)
    const value = n != null && Number.isFinite(n) ? n : null
    const next = { ...(filters.ranges ?? {}) }
    next[id] = { ...(next[id] ?? {}), [key]: value }
    onChange({ ...filters, ranges: next })
  }
  const filtering = isFiltering(filters)
  // Reads COMMITTED state, never draft text. The Edge bubble's chips are a
  // useMemo over what is being typed and vanish when it closes (QueryBubble
  // sets the text to empty on both close and open), which is exactly the gap
  // this strip fills: an exclusion is authored by ONE sentence across several
  // facets, so the alternative to a strip is opening seven dropdowns.
  const chips = excludeChips(filters, trades)

  return (
    <div className="space-y-3">
      {/* Active exclusions, named and individually removable. Rendered only when
          there ARE some -- no empty container, no heading over nothing. */}
      {chips.length > 0 && (
        <div data-testid="exclusion-strip" className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Excluding
          </span>
          {chips.map((c) => (
            <ExcludeChip
              key={c.key}
              label={c.label}
              testId={`exclusion-chip-${c.field}`}
              onRemove={() => onChange(removeExcluded(filters, c.field, c.value))}
            />
          ))}
        </div>
      )}
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

        <MistakesFilterDropdown
          selected={filters.mistakeKeys}
          onChange={(next) => onChange({ ...filters, mistakeKeys: next })}
        />

        <CatalystFilterDropdown
          selected={filters.catalystTypes}
          onChange={(next) => onChange({ ...filters, catalystTypes: next })}
        />

        <GeoFilterDropdown
          label="Region"
          trades={trades}
          keyOf={(t) => (t.region === 'Unknown' || !t.region ? null : t.region)}
          labelOf={(v) => v}
          selected={filters.regions}
          onChange={(next) => onChange({ ...filters, regions: next })}
        />

        <GeoFilterDropdown
          label="Country"
          trades={trades}
          keyOf={(t) => t.country}
          labelOf={(v, t) => t?.country_name ?? v}
          selected={filters.countries}
          onChange={(next) => onChange({ ...filters, countries: next })}
        />

        <GeoFilterDropdown
          label="Sector"
          trades={trades}
          keyOf={(t) => t.sector ?? null}
          labelOf={(v) => v}
          selected={filters.sectors}
          onChange={(next) => onChange({ ...filters, sectors: next })}
        />

        <GeoFilterDropdown
          label="Industry"
          trades={trades}
          keyOf={(t) => t.industry ?? null}
          labelOf={(v) => v}
          selected={filters.industries}
          onChange={(next) => onChange({ ...filters, industries: next })}
        />

        <DnaFilterDropdown
          ask={filters.dna}
          onChange={(next) => onChange({ ...filters, dna: next })}
        />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            From
          </span>
          <input
            type="date"
            aria-label="Date from"
            value={filters.dateFrom}
            onChange={(e) => onChange(withManualDate(filters, 'from', e.target.value))}
            className="h-8 cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            To
          </span>
          <input
            type="date"
            aria-label="Date to"
            value={filters.dateTo}
            onChange={(e) => onChange(withManualDate(filters, 'to', e.target.value))}
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

      {numericColumns.length > 0 && (
        <div
          data-testid="range-filters"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border-subtle/60 bg-bg-1/40 px-3 py-2"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Ranges
          </span>
          {numericColumns.map((c) => (
            <div key={c.id} data-testid={`range-${c.id}`} className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                {c.label}
              </span>
              <input
                type="number"
                aria-label={`${c.label} minimum`}
                value={filters.ranges?.[c.id]?.min ?? ''}
                onChange={(e) => setRange(c.id, 'min', e.target.value)}
                placeholder="min"
                className="h-7 w-16 rounded-md border border-border-subtle bg-bg-1 px-1.5 font-mono text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-gold focus:outline-none"
              />
              <input
                type="number"
                aria-label={`${c.label} maximum`}
                value={filters.ranges?.[c.id]?.max ?? ''}
                onChange={(e) => setRange(c.id, 'max', e.target.value)}
                placeholder="max"
                className="h-7 w-16 rounded-md border border-border-subtle bg-bg-1 px-1.5 font-mono text-[11px] text-fg-primary placeholder:text-fg-muted focus:border-gold focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
      </div>
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

// v0.2.7 — multi-select BOOK-DERIVED filter. Born for region/country; sector
// and industry ride it unchanged (the market-data join, same null semantics),
// which is the proof it generalises: any nullable string on the row with a
// keyOf/labelOf pair gets the same dropdown. Clones
// the Catalyst shell (trigger + count badge + click-outside/Escape + null-bucket
// row + Clear), with ONE deliberate departure: options derive from the LOADED
// BOOK, not a def table and not a hardcoded list — a book with no Brazil trades
// shows no Brazil option, and the count beside each value is the book's own.
// No IPC, no lazy load: the trades are already in the page's memory.
// `null` is the unresolved bucket (region 'Unknown' / country IS NULL upstream);
// keyOf maps a row to its option key, labelOf renders it (country shows the
// cached country_name, never the bare ISO).
function GeoFilterDropdown({
  label,
  trades,
  keyOf,
  labelOf,
  selected,
  onChange,
}: {
  label: string
  trades: TradeListRow[]
  keyOf: (t: TradeListRow) => string | null
  labelOf: (value: string, sample: TradeListRow | undefined) => string
  selected: (string | null)[]
  onChange: (next: (string | null)[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Distinct values with counts, sorted most-traded first (the order the book
  // itself suggests). The null bucket is tracked separately and only offered
  // when the book actually has unresolved rows.
  const options = useMemo(() => {
    const counts = new Map<string, { n: number; sample: TradeListRow }>()
    let unresolved = 0
    for (const t of trades) {
      const k = keyOf(t)
      if (k === null) {
        unresolved += 1
        continue
      }
      const cur = counts.get(k)
      if (cur) cur.n += 1
      else counts.set(k, { n: 1, sample: t })
    }
    const rows = [...counts.entries()]
      .map(([value, { n, sample }]) => ({ value, n, text: labelOf(value, sample) }))
      .sort((a, b) => b.n - a.n || a.text.localeCompare(b.text))
    return { rows, unresolved }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades])

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
  const unknownSelected = selected.includes(null)

  const toggle = (value: string | null) => {
    onChange(
      selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value],
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`Filter by ${label.toLowerCase()}`}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
          active
            ? 'border-gold/40 text-fg-primary'
            : 'border-border-subtle text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        {label}
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
          {/* Unresolved bucket — offered only when the book has such rows. */}
          {options.unresolved > 0 && (
            <>
              <button
                type="button"
                onClick={() => toggle(null)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                  unknownSelected
                    ? 'bg-white/[0.04] text-fg-primary'
                    : 'text-fg-tertiary hover:bg-white/[0.04]'
                }`}
              >
                <FilterCheckbox checked={unknownSelected} />
                <span className="italic">Unknown</span>
                <span className="ml-auto font-mono text-[10px] text-fg-muted">{options.unresolved}</span>
              </button>
              <div className="my-1 h-px bg-border-subtle" />
            </>
          )}

          {options.rows.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                  checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
                }`}
              >
                <FilterCheckbox checked={checked} />
                <span className="truncate">{o.text}</span>
                <span className="ml-auto font-mono text-[10px] text-fg-muted">{o.n}</span>
              </button>
            )
          })}
          {options.rows.length === 0 && options.unresolved === 0 && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">No trades loaded</div>
          )}

          {active && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
              >
                Clear {label.toLowerCase()}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// v0.2.7 — the five-pillar ASK. Same shell as the geo/catalyst dropdowns; the
// content is two small sections rather than a list: a completeness bucket
// (with INCOMPLETE offered by name — on a lightly-journaled book it is most of
// the answer, and hiding it makes the filter look broken) and a "score at
// least" bar of five chips. The two asks interact: an incomplete trade can
// never meet a score bar, so picking a score while "Incomplete" is on returns
// the bucket to Any, and picking "Incomplete" clears the score — the state
// stays satisfiable instead of quietly matching nothing. Thresholds are NOT
// here; they live in Settings and the verdicts arrive on the rows.
function DnaFilterDropdown({
  ask,
  onChange,
}: {
  ask: DnaFilterAsk
  onChange: (next: DnaFilterAsk) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const active = ask.minScore !== null || ask.bucket !== 'any'
  const count = (ask.minScore !== null ? 1 : 0) + (ask.bucket !== 'any' ? 1 : 0)

  const setBucket = (b: DnaFilterAsk['bucket']) => {
    const next = ask.bucket === b ? 'any' : b
    onChange({
      // An incomplete trade cannot meet a score bar — keep the ask satisfiable.
      minScore: next === 'incomplete' ? null : ask.minScore,
      bucket: next,
    })
  }
  const setMin = (n: number) => {
    const next = ask.minScore === n ? null : n
    onChange({
      minScore: next,
      bucket: next !== null && ask.bucket === 'incomplete' ? 'any' : ask.bucket,
    })
  }

  const bucketRow = (b: 'complete' | 'incomplete', label: string) => {
    const checked = ask.bucket === b
    return (
      <button
        type="button"
        onClick={() => setBucket(b)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
          checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
        }`}
      >
        <FilterCheckbox checked={checked} />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Filter by DNA score"
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
          active
            ? 'border-gold/40 text-fg-primary'
            : 'border-border-subtle text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        DNA
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
        <div className="absolute left-0 z-20 mt-1 w-[240px] rounded-md border border-border-subtle bg-bg-3 p-2 shadow-lg">
          {bucketRow('complete', 'Complete (all pillars judged)')}
          {bucketRow('incomplete', 'Incomplete (missing inputs)')}

          <div className="my-1 h-px bg-border-subtle" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Score at least
          </div>
          <div className="flex items-center gap-1 px-2 pb-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = ask.minScore === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMin(n)}
                  aria-pressed={on}
                  aria-label={`Score at least ${n}`}
                  className={`inline-flex h-7 w-8 cursor-pointer items-center justify-center rounded-md border font-mono text-[11px] transition-colors duration-150 ${
                    on
                      ? 'border-gold/50 bg-gold/[0.10] text-gold'
                      : 'border-border-subtle bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>

          {active && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <button
                type="button"
                onClick={() => onChange({ minScore: null, bucket: 'any' })}
                className="flex w-full items-center justify-center rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
              >
                Clear DNA
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

// The two-axis section order + labels — mirrors TradeMistakePicker's AXES so the
// filter speaks the same language as the per-trade editor.
const MISTAKE_AXES: { axis: MistakeAxis; label: string }[] = [
  { axis: 'technical', label: 'Technical' },
  { axis: 'psychological', label: 'Psychological' },
]

// Multi-select MISTAKES filter — clones PlaybookFilterDropdown's shell/trigger/
// panel exactly, but the body is TWO axis-grouped sections (Technical then
// Psychological) instead of the system/user split. Selection is keyed by
// {axis, name} (NOT id): the trade row carries mistake names + {name, axis}
// tags, never ids, and the same name can live on both axes. Neutral checkboxes,
// no tier badges (mistakes have no tier) and NOT the modal's loss-red.
function MistakesFilterDropdown({
  selected,
  onChange,
}: {
  selected: { axis: MistakeAxis; name: string }[]
  onChange: (next: { axis: MistakeAxis; name: string }[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [defs, setDefs] = useState<MistakeDef[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Lazy-load the ACTIVE vocabulary on first open (no arg -> archived excluded);
  // cache in state so re-opening never refetches.
  useEffect(() => {
    if (!open || defs) return
    let cancelled = false
    ipc.mistakeDefsGet().then((list) => {
      if (!cancelled) setDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [open, defs])

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

  const isChecked = (axis: MistakeAxis, name: string) =>
    selected.some((k) => k.axis === axis && k.name === name)

  const toggle = (axis: MistakeAxis, name: string) => {
    onChange(
      isChecked(axis, name)
        ? selected.filter((k) => !(k.axis === axis && k.name === name))
        : [...selected, { axis, name }],
    )
  }

  const renderRow = (d: MistakeDef) => {
    const checked = isChecked(d.axis, d.name)
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => toggle(d.axis, d.name)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
          checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
        }`}
      >
        <FilterCheckbox checked={checked} />
        <span className="truncate">{d.name}</span>
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Filter by mistake"
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
          active
            ? 'border-gold/40 text-fg-primary'
            : 'border-border-subtle text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        Mistakes
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
          {!defs && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">Loading…</div>
          )}
          {defs &&
            (() => {
              // Group by axis, drop empty sections, render Technical then
              // Psychological with a divider only BETWEEN rendered sections.
              const sections = MISTAKE_AXES.map(({ axis, label }) => ({
                axis,
                label,
                rows: defs.filter((d) => d.axis === axis),
              })).filter((s) => s.rows.length > 0)
              if (sections.length === 0) {
                return <div className="px-2 py-2 text-[10px] text-fg-muted">No mistakes</div>
              }
              return sections.map((s, i) => (
                <div key={s.axis}>
                  {i > 0 && <div className="my-1 h-px bg-border-subtle" />}
                  <div className="mb-1 mt-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    {s.label}
                  </div>
                  {s.rows.map(renderRow)}
                </div>
              ))
            })()}
          {active && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
              >
                Clear mistakes
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Multi-select CATALYST filter — the simplest of the three: a flat list of the
// live catalyst vocabulary (catalystDefsGet, active-only) with a "No catalyst"
// null option, matched by NAME against trades.catalyst_type (a free-form string,
// no id). Clones the Mistakes shell/load + Playbook's null-bucket row; no tier
// badges, no system/user split, no axis sections.
function CatalystFilterDropdown({
  selected,
  onChange,
}: {
  selected: (string | null)[]
  onChange: (next: (string | null)[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [defs, setDefs] = useState<CatalystDef[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Lazy-load the ACTIVE vocabulary on first open (no arg -> archived excluded);
  // cache in state so re-opening never refetches. Source order = sort_position.
  useEffect(() => {
    if (!open || defs) return
    let cancelled = false
    ipc.catalystDefsGet().then((list) => {
      if (!cancelled) setDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [open, defs])

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
  const noCatalystSelected = selected.includes(null)

  const toggle = (value: string | null) => {
    onChange(
      selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value],
    )
  }

  const renderRow = (d: CatalystDef) => {
    const checked = selected.includes(d.name)
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => toggle(d.name)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
          checked ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
        }`}
      >
        <FilterCheckbox checked={checked} />
        <span className="truncate">{d.name}</span>
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Filter by catalyst"
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
          active
            ? 'border-gold/40 text-fg-primary'
            : 'border-border-subtle text-fg-tertiary hover:border-gold/40 hover:text-gold'
        }`}
      >
        Catalyst
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
          {/* Untagged bucket — trades with no catalyst (catalyst_type === null). */}
          <button
            type="button"
            onClick={() => toggle(null)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
              noCatalystSelected
                ? 'bg-white/[0.04] text-fg-primary'
                : 'text-fg-tertiary hover:bg-white/[0.04]'
            }`}
          >
            <FilterCheckbox checked={noCatalystSelected} />
            <span className="italic">No catalyst</span>
          </button>

          <div className="my-1 h-px bg-border-subtle" />

          {!defs && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">Loading…</div>
          )}

          {defs && (
            <>
              {defs.map(renderRow)}
              {defs.length === 0 && (
                <div className="px-2 py-2 text-[10px] text-fg-muted">No catalysts</div>
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
                Clear catalysts
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

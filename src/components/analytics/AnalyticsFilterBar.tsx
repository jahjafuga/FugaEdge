import { useMemo, useState } from 'react'
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import {
  addDays,
  distinctCatalysts,
  distinctMistakes,
  distinctPlaybooks,
  emptyFilters,
  rangeFromDates,
  startOfYear,
  type DateRange,
  type DurationBucket,
  type OverviewFilters,
  type SideFilter,
} from '@/core/performance'
import Card from '@/components/ui/Card'
import MultiSelectMenu from '@/components/ui/MultiSelectMenu'
import Segment from '@/components/ui/Segment'

// Analytics-only daily-dashboard filter bar. STANDALONE by design: it does NOT
// import or reuse reports/overview/FilterBar (which stays byte-identical for the
// still-live Reports tab). The small control duplication here is deliberate and
// dissolves when Reports is retired. Differences from the shared bar: premium
// CARD chrome (matches the snapshot cards on the tab, not a flat sticky strip),
// a "More filters" expander (collapsed by default), no Compare button, and a
// LOCAL quick-range strip that owns a 7D option + default WITHOUT touching the
// shared QuickRange type / rangeForQuick.

/** Local quick-range keys — NOT the shared QuickRange (which has no '7d'). Owned
 *  here so a 7D default needs zero shared-type change. */
export type QuickKey = '7d' | '30d' | '90d' | 'ytd' | 'all'

const QUICK: { value: QuickKey; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'ALL' },
]

/** Inclusive DateRange for each quick key. Mirrors rangeForQuick's windows for
 *  30d/90d/ytd/all and adds the 7d window — but stays LOCAL so the shared
 *  rangeForQuick / QuickRange are untouched. Null = no date constraint. */
export function rangeForQuickKey(key: QuickKey, now: Date = new Date()): DateRange | null {
  if (key === 'all') return null
  if (key === 'ytd') return rangeFromDates(startOfYear(now), now)
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  return rangeFromDates(addDays(now, -(days - 1)), now)
}

/** Human label for the chart titles, e.g. "7 days". */
export function quickKeyLabel(key: QuickKey): string {
  switch (key) {
    case '7d':
      return '7 days'
    case '30d':
      return '30 days'
    case '90d':
      return '90 days'
    case 'ytd':
      return 'YTD'
    case 'all':
      return 'All time'
  }
}

const SIDES: { value: SideFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]

const DURATIONS: { value: DurationBucket; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'under-1m', label: '<1m' },
  { value: '1-5m', label: '1–5m' },
  { value: '5-30m', label: '5–30m' },
  { value: 'over-30m', label: '>30m' },
]

interface AnalyticsFilterBarProps {
  trades: TradeListRow[]
  filters: OverviewFilters
  onFiltersChange: (next: OverviewFilters) => void
  /** Local highlight key (incl. '7d'); owned by the dashboard. */
  quick: QuickKey
  onQuickChange: (q: QuickKey) => void
}

export default function AnalyticsFilterBar({
  trades,
  filters,
  onFiltersChange,
  quick,
  onQuickChange,
}: AnalyticsFilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const playbookOptions = useMemo(() => distinctPlaybooks(trades), [trades])
  const catalystOptions = useMemo(() => distinctCatalysts(trades), [trades])
  const mistakeOptions = useMemo(() => distinctMistakes(trades), [trades])

  const set = <K extends keyof OverviewFilters>(key: K, value: OverviewFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  // Picking a quick range writes filters.range AND the local highlight key.
  const pickQuick = (key: QuickKey) => {
    onQuickChange(key)
    set('range', rangeForQuickKey(key))
  }

  // Reset restores the 7D default fully — range AND highlight agree (the shared
  // bar reset range to null while still highlighting a button; this doesn't).
  const reset = () => {
    onFiltersChange({ ...emptyFilters(), range: rangeForQuickKey('7d') })
    onQuickChange('7d')
  }

  // Whether any control hidden behind the expander is active — so the collapsed
  // "More filters" button can signal there's something live underneath.
  const moreActive =
    filters.duration !== 'all' ||
    filters.playbooks.length > 0 ||
    filters.catalysts.length > 0 ||
    filters.mistakes.length > 0

  return (
    <Card title="Filters" subtitle="Symbol, side, and range — expand for more." hover={false}>
      <div className="space-y-3">
        {/* Essentials — always visible */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filters.symbol}
            onChange={(e) => set('symbol', e.target.value)}
            placeholder="Symbol"
            className="h-8 w-28 rounded-md border border-border-strong bg-bg-1 px-2.5 text-xs text-fg-primary placeholder:text-fg-tertiary focus:border-gold focus:outline-none"
          />

          <Segment options={SIDES} value={filters.side} onChange={(v) => set('side', v)} />

          <Segment options={QUICK} value={quick} onChange={pickQuick} />

          <button
            type="button"
            onClick={reset}
            title="Reset all filters"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-2.5 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            <RotateCcw size={12} strokeWidth={2} />
            Reset
          </button>

          {/* "More filters" expander toggle — CollapsibleCard chevron +
              aria-expanded idiom. Gold-tinted when a hidden filter is active. */}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
              moreActive
                ? 'border-gold/50 bg-gold/[0.08] text-gold'
                : 'border-border-strong bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
            }`}
          >
            <SlidersHorizontal size={12} strokeWidth={2} />
            More filters
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* More filters — collapsed by default */}
        {moreOpen && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <div className="inline-flex items-center gap-1.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary"
                title="Trade hold time — how long between entry and exit"
              >
                Duration
              </span>
              <Segment
                options={DURATIONS}
                value={filters.duration}
                onChange={(v) => set('duration', v)}
              />
            </div>

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
          </div>
        )}
      </div>
    </Card>
  )
}

// The multi-select popover the three menus above ride lives in
// @/components/ui/MultiSelectMenu — extracted (Dave #14 A) so the Compare
// tab's mistake picker shares it instead of cloning.

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
    <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
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

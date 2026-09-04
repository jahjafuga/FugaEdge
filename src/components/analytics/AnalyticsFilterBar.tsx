import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
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
import MultiSelectMenu from '@/components/ui/MultiSelectMenu'
import { isNarrowedBeyondRange } from '@/core/performance/overviewScopeLabel'
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

/** What the STRIP is currently reporting: one of its five keys, or the
 *  sentinel meaning NO KEY DESCRIBES THIS WINDOW. A custom From/To range is
 *  not a key and must not pretend to be one.
 *
 *  'custom' IS A STRING ON PURPOSE. Segment takes <T extends string> and
 *  compares o.value === value, so a sentinel outside its options leaves every
 *  key inactive with no edit to that shared component. null would not satisfy
 *  the constraint; undefined would be swallowed by the quick = 'all' default
 *  below and light the ALL key, which is the lie this removes.
 *
 *  rangeForQuickKey KEEPS TAKING QuickKey. The sentinel says no window can be
 *  derived, so nothing may derive one from it. */
export type QuickSelection = QuickKey | 'custom'

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
export function quickKeyLabel(key: QuickSelection): string {
  switch (key) {
    case 'custom':
      return 'Custom range'
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

// ── ONE CONTROL METRIC ──────────────────────────────────────────────────────
// Every control in this bar is built from these strings rather than styled in
// place, so "one height, one radius, one border token, one focus ring" is enforced
// by construction instead of by discipline.
//
// The vocabulary is TradesFilters' search cluster + MultiSelectMenu's trigger — the
// most finished control cluster in the app, and already the metric Segment uses
// (h-8 / rounded-md / border-border-strong / bg-bg-1).

/** Height, radius, border, surface, transition — the shared skeleton for buttons. */
const CONTROL =
  'inline-flex h-8 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 transition-colors duration-150'

/** The same skeleton for a container that HOLDS an input rather than being one. */
const FIELD =
  'inline-flex h-8 items-center rounded-md border border-border-strong bg-bg-1 transition-colors duration-150'

/** THE focus ring, for FOCUSABLE CONTROLS ONLY. shadow-glow-gold was declared
 *  in tailwind.config and used by nothing — the app had 37 focus-border
 *  treatments and no ring anywhere. This wires up the token the design system
 *  had already defined.
 *
 *  NOT ON A GROUP WRAPPER (beat 299). focus-within fires when ANY descendant
 *  holds focus, and a clicked button holds focus, so a span wrapping a Segment
 *  lit the whole group on a mouse click. The focus-visible half cannot save it:
 *  a span is not focusable, so it never matches focus-visible itself. The
 *  Segment keys are buttons and the global rule at src/index.css:453-462
 *  already rings every button:focus-visible, which is keyboard-only by
 *  definition. So the wrappers carry no ring and the key carries its own. */
const RING =
  'focus-within:border-gold focus-within:shadow-glow-gold focus-visible:border-gold focus-visible:shadow-glow-gold focus-visible:outline-none'

/** Hairline group separator. Whitespace alone is what made the row read loose. */
function Rule() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-subtle" />
}

interface AnalyticsFilterBarProps {
  trades: TradeListRow[]
  filters: OverviewFilters
  onFiltersChange: (next: OverviewFilters) => void
  /** Local highlight key (incl. '7d'); owned by the dashboard. Optional so a
   *  caller that hides the range strip does not have to invent one. */
  quick?: QuickSelection
  onQuickChange?: (q: QuickSelection) => void
  /** Whether this bar owns a DATE RANGE. Default true, so every existing
   *  caller is byte identical. Compare passes false: its period pickers own
   *  dates, and a page level range narrower than a period would silently
   *  shrink that period without saying so. */
  showRange?: boolean
  /** Whether this bar owns the SIDE facet. Default true, so every existing
   *  caller is byte identical. Long vs Short passes false: that tab IS the
   *  side split, and a side filter on top of it would silently empty one of
   *  the two columns it exists to compare. Same shape as showRange above. */
  showSide?: boolean
  /** True once the bar is PINNED and content is scrolling under it. Drives the
   *  shadow step from resting to lifted — the only cue that says "this is stuck". */
  elevated?: boolean
  /** Honest in-tab population line ("X of Y round trips - scope"). Mirrors
   *  TechnicalsFilterBar's scopeLabel: the page subtitle is all-time and shared by
   *  every tab, so the tab states its OWN population here instead of letting that
   *  subtitle read as if it scoped this tab. Omitted = render nothing. */
  scopeLabel?: string
}

export default function AnalyticsFilterBar({
  trades,
  filters,
  onFiltersChange,
  quick = 'all',
  onQuickChange,
  scopeLabel,
  elevated = false,
  showRange = true,
  showSide = true,
}: AnalyticsFilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )

  // THE PANEL IS LIFTED OUT OF THE BAR'S TREE.
  //
  // The sticky wrapper this bar sits in is `sticky top-0 z-30` — a positioned element
  // with a non-auto z-index, which makes it a STACKING CONTEXT. A stacking context
  // flattens its descendants: the panel's own z-index is resolved INSIDE it and can
  // never escape, so however high the panel counted it still painted at the wrapper's
  // 30. Measured against the app's scale that put it, and its full-viewport dismiss
  // backdrop, UNDER the TopBar (sticky z-40) — clicking the header while the panel
  // was open did not close it.
  //
  // Raising the wrapper instead would be wrong: content-level sticky belongs below
  // the chrome, and the bar out-ranking the TopBar is a worse bug than the one being
  // fixed. So the panel leaves the tree entirely via a portal to document.body, where
  // it sits in the ROOT stacking context and its z-index finally means what it says.
  // It tracks the bar by measured rect rather than by CSS anchoring, which is the
  // price of the portal and the reason for the scroll/resize listeners.
  useEffect(() => {
    if (!moreOpen) return
    const measure = () => {
      const el = barRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchor({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    measure()
    // Capture phase: the bar scrolls inside AppLayout's pane, not the window.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [moreOpen])
  const playbookOptions = useMemo(() => distinctPlaybooks(trades), [trades])
  const catalystOptions = useMemo(() => distinctCatalysts(trades), [trades])
  const mistakeOptions = useMemo(() => distinctMistakes(trades), [trades])

  const set = <K extends keyof OverviewFilters>(key: K, value: OverviewFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  // Picking a quick range writes filters.range AND the local highlight key.
  const pickQuick = (key: QuickKey) => {
    onQuickChange?.(key)
    set('range', rangeForQuickKey(key))
  }

  // Reset restores the 7D default fully — range AND highlight agree (the shared
  // bar reset range to null while still highlighting a button; this doesn't).
  // With no range strip there is no default window to restore, so reset clears
  // to a plain empty filter and leaves range null.
  const reset = () => {
    if (!showRange) {
      onFiltersChange(emptyFilters())
      return
    }
    onFiltersChange({ ...emptyFilters(), range: rangeForQuickKey('7d') })
    onQuickChange?.('7d')
  }

  // ONE question, asked once: is the user looking at a SUBSET of their book?
  // A date window is a subset exactly as much as a symbol filter is, so both count.
  // Reset appears only when this is true (there is nothing to reset otherwise) and
  // the scope line is promoted only when this is true (it is the only thing on the
  // page that says the numbers describe part of the book rather than all of it).
  const subset = showRange
    ? isNarrowedBeyondRange(filters) || quick !== 'all'
    : isNarrowedBeyondRange(filters)

  // Whether any control hidden behind the expander is active — so the collapsed
  // "More filters" button can signal there's something live underneath.
  const moreActive =
    filters.duration !== 'all' ||
    filters.playbooks.length > 0 ||
    filters.catalysts.length > 0 ||
    filters.mistakes.length > 0

  return (
    // ONE SURFACE. An elevated container rather than a strip on the page: the app's
    // card language (--card-radius, a real border, bg-bg-2, a themed shadow token)
    // so it reads as sitting ABOVE the content rather than floating in it.
    //
    // NO backdrop-blur. At the 95% opacity it sat behind, the blur was invisible,
    // cost a compositor layer on every scroll frame, and — the reason it had to go —
    // backdrop-filter creates a stacking context that would have trapped the
    // More-filters overlay inside the bar's own bounds.
    //
    // `relative` is the overlay's anchor: the panel below is absolutely positioned
    // against THIS box, so opening it cannot change the bar's height.
    <div className="relative">
      <div
        ref={barRef}
        data-testid="overview-toolbar"
        className={`flex flex-wrap items-center gap-2 rounded-[var(--card-radius)] border border-border-subtle bg-bg-2 px-3 py-2.5 transition-shadow duration-200 ${
          elevated ? 'shadow-lg' : 'shadow-md'
        }`}
      >
        {/* GROUP 1 — search. The symbol box is a search field now: leading icon and
            a clear affordance, matching TradesFilters' field, the most finished
            control cluster in the app. */}
        <div className={`${FIELD} w-40 gap-2 px-2.5`}>
          <Search size={14} strokeWidth={1.75} className="shrink-0 text-fg-tertiary" />
          <input
            type="text"
            value={filters.symbol}
            onChange={(e) => set('symbol', e.target.value)}
            placeholder="Symbol"
            className="w-full bg-transparent text-xs uppercase text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
          />
          {filters.symbol && (
            <button
              type="button"
              onClick={() => set('symbol', '')}
              aria-label="Clear symbol"
              className="shrink-0 cursor-pointer text-fg-muted hover:text-fg-secondary"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <Rule />

        {/* GROUP 2 — side. Gold here is the SELECTED segment: active state. */}
        {showSide && (
          <span data-facet="side" className="inline-flex rounded-md">
            <Segment options={SIDES} value={filters.side} onChange={(v) => set('side', v)} />
          </span>
        )}

        {showRange && (
          <>
            <Rule />

            {/* GROUP 3 — range. Gold here is the SELECTED window: active state. */}
            <span className="inline-flex rounded-md">
              {/* Typed on the SELECTION so the sentinel can be rendered; the
                  options are still the five keys, so the handler narrows back
                  to a QuickKey by a real guard rather than a cast. 'custom'
                  can never arrive here: it is not among the options. */}
              <Segment<QuickSelection>
                options={QUICK}
                value={quick}
                onChange={(v) => {
                  if (v !== 'custom') pickQuick(v)
                }}
              />
            </span>
          </>
        )}

        {/* GROUP 4 — status + expander, anchored right. */}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {subset && (
            <button
              type="button"
              onClick={reset}
              title="Reset all filters"
              className={`${CONTROL} ${RING} gap-1.5 px-2.5 text-[10px] uppercase tracking-wider text-fg-tertiary hover:border-gold/40 hover:text-gold`}
            >
              <RotateCcw size={12} strokeWidth={2} />
              Reset
            </button>
          )}

          {/* The only thing on the page that says these numbers describe part of the
              book rather than all of it. Muted while the whole book is in view, a
              gold pill the moment it is not. Same words either way. */}
          {scopeLabel && (
            <span
              data-testid="overview-scope"
              className={
                subset
                  ? 'truncate rounded-full border border-gold/40 bg-gold/[0.10] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-gold'
                  : 'truncate text-[11px] font-medium text-fg-tertiary'
              }
            >
              {scopeLabel}
            </span>
          )}

          {/* Neutral at rest, gold ONLY when a hidden filter is actually set — the
              accent reports that something is on, never that a button exists. */}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`${CONTROL} ${RING} gap-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider ${
              moreActive
                ? 'border-gold/50 bg-gold/[0.08] text-gold'
                : 'text-fg-tertiary hover:border-gold/40 hover:text-gold'
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
      </div>

      {/* MORE FILTERS, portaled to document.body — see the note on the effect above.
          It anchors to the bar's measured bottom edge, matches its width and radius,
          and is not in the bar's tree at all, so it cannot change the bar's height.

          z-[44] / z-[45] come from the app's OWN measured scale: TopBar 40, modals 50,
          activation 60, toasts 110/210. The backdrop clears the TopBar so a click
          anywhere dismisses; the panel stays below modal chrome, which should still
          out-rank a filter popover.

          bg-bg-2 is fully opaque — the panel is the one surface here that nothing may
          show through, so it deliberately does NOT use .card-premium's 0.92 felt. */}
      {moreOpen &&
        anchor &&
        createPortal(
          <>
            <div
              data-testid="overview-more-backdrop"
              className="fixed inset-0 z-[44]"
              onClick={() => setMoreOpen(false)}
            />
            <div
              data-testid="overview-more-panel"
              style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
              className="fixed z-[45] rounded-[var(--card-radius)] border border-border-subtle bg-bg-2 p-3 shadow-lg"
            >
            <div className="flex flex-wrap items-center gap-2">
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

            {showRange && (
              <div className="flex items-center gap-1">
                {/* A hand-picked window is not one of the five keys, so the
                    host is told the strip no longer describes it (beat 302).
                    Both fields report; clearing a field is still a custom
                    state, not a return to a key. */}
                <DateField
                  label="From"
                  value={filters.range?.from ?? ''}
                  onChange={(v) => {
                    onQuickChange?.('custom')
                    set('range', v ? { from: v, to: filters.range?.to ?? v } : null)
                  }}
                />
                <DateField
                  label="To"
                  value={filters.range?.to ?? ''}
                  onChange={(v) => {
                    onQuickChange?.('custom')
                    set('range', v ? { from: filters.range?.from ?? v, to: v } : null)
                  }}
                />
              </div>
            )}
            </div>
            </div>
          </>,
          document.body,
        )}
    </div>
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

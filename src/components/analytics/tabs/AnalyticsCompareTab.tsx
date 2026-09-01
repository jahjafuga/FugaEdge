import { useEffect, useMemo, useState } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import AnalyticsFilterBar from '@/components/analytics/AnalyticsFilterBar'
import CompareView from '@/components/reports/overview/CompareView'
import { ipc } from '@/lib/ipc'
import {
  applyFilters,
  emptyFilters,
  rangeForPreset,
  type DateRange,
  type OverviewFilters,
} from '@/core/performance'
import { isNarrowedBeyondRange } from '@/core/performance/overviewScopeLabel'
import type { TradeListRow } from '@shared/trades-types'

interface AnalyticsCompareTabProps {
  trades: TradeListRow[]
  /** Optional pre-loaded periods (e.g. deep-linked from the Calendar compare
   *  card). Present → SEED the initial A/B ranges; absent → the usual
   *  thisMonth/lastMonth defaults. The picker can still change them after mount. */
  initialRangeA?: DateRange
  initialRangeB?: DateRange
}

// Beat A of the Compare promotion — the existing Reports → Overview compare
// feature, lifted into a dedicated always-on Analytics tab. Reuses CompareView
// unchanged (its period pickers + compute are self-contained) and re-creates the
// minimal glue that previously lived in reports/OverviewTab: the A/B range state
// and the per-day sentiment map. This caller is what makes CompareView a shared
// keeper before Beat B retires the Reports page.
//
// FULL FILTER PARITY, DELIVERED. This comment used to say that parity beyond
// the mistake dimension stayed earmarked for the flagship redesign arc. Beat
// 219 measured what that reservation was actually costing: Compare received
// raw rows and called applyFilters with emptyFilters() plus mistakes, so six
// of the seven dimensions in OverviewFilters were unreachable from this tab.
// Beat 224 delivers them. The tab now renders the same AnalyticsFilterBar
// Overview renders, with one deliberate omission.
//
// THE DATE RANGE IS OMITTED, and that is a design ruling rather than an
// oversight. CompareView's period pickers own dates. A page level range
// narrower than a period would silently shrink that period without saying so,
// which is the kind of quiet wrong this codebase refuses. The bar takes
// showRange={false} and its own reset clears to a plain empty filter.
//
// The mechanism is unchanged from the mistake-only version: ONE rows array
// goes into computePeriodComparison, which takes one array and two ranges, so
// narrowing the array narrows both periods identically.
export default function AnalyticsCompareTab({
  trades,
  initialRangeA,
  initialRangeB,
}: AnalyticsCompareTabProps) {
  const [rangeA, setRangeA] = useState<DateRange>(() => initialRangeA ?? rangeForPreset('thisMonth'))
  const [rangeB, setRangeB] = useState<DateRange>(() => initialRangeB ?? rangeForPreset('lastMonth'))

  // The full cross-filter. The wiring is the recovered b88d290^ Reports
  // pattern — `applyFilters(trades, { ...filters, range: null })` — now
  // carrying every dimension the bar exposes rather than the single mistake
  // one. range is FORCED null on the way in: the state can never hold a range
  // because the bar renders no range control, and forcing it here means a
  // future control could not quietly start shrinking the periods either.
  // Both periods narrow through the same rows; multi-select is a union
  // (a trade with EITHER mistake passes, applyFilters' predicate).
  const [filters, setFilters] = useState<OverviewFilters>(emptyFilters)
  const filteredTrades = useMemo(
    () => applyFilters(trades, { ...filters, range: null }),
    [trades, filters],
  )
  // Any non-range dimension being set is what makes the growth row's mixed
  // ratio dishonest, and this is the pure predicate that already asks exactly
  // that question. It ignores range by construction, which is the shape
  // Compare needs.
  const filtersActive = isNarrowedBeyondRange(filters)

  // Sentiment map keyed by date — needed for the "By Market Sentiment" compare
  // breakdown card. Fetched once; optional (empty map on failure so the card
  // just shows nothing instead of crashing). Mirrors reports/OverviewTab.
  const [sentimentByDate, setSentimentByDate] = useState<Map<string, number | null>>(new Map())
  useEffect(() => {
    let cancelled = false
    ipc
      .sessionListAll()
      .then((rows) => {
        if (cancelled) return
        const m = new Map<string, number | null>()
        for (const r of rows) m.set(r.date, r.sentiment)
        setSentimentByDate(m)
      })
      .catch(() => {
        if (!cancelled) setSentimentByDate(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Compare"
        description="Two periods, side by side — days, weeks, months, or custom ranges."
      />
      <CompareView
        trades={filteredTrades}
        sentimentByDate={sentimentByDate}
        rangeA={rangeA}
        rangeB={rangeB}
        onRangeChange={(which, range) => {
          if (which === 'A') setRangeA(range)
          else setRangeB(range)
        }}
        filtersActive={filtersActive}
        // v0.2.7 -- the controls sit INSIDE the periods card so they read as
        // controls OF the comparison rather than something floating above it.
        // Beat 224 widened the one dropdown that used to live here into the
        // whole bar; the placement ruling is unchanged.
        filterSlot={
          <>
            <div className="w-full">
              <AnalyticsFilterBar
                trades={trades}
                filters={filters}
                onFiltersChange={setFilters}
                showRange={false}
              />
            </div>
            {filtersActive && (
              <span className="text-[10px] text-fg-tertiary">
                both periods narrowed to the trades these filters keep
              </span>
            )}
          </>
        }
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import MultiSelectMenu from '@/components/ui/MultiSelectMenu'
import CompareView from '@/components/reports/overview/CompareView'
import { ipc } from '@/lib/ipc'
import {
  applyFilters,
  distinctMistakes,
  emptyFilters,
  rangeForPreset,
  type DateRange,
} from '@/core/performance'
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
// Minimal promote, partially reconsidered: the MISTAKE half of the dropped
// FilterBar cross-filter landed (Dave #14 A) as a Compare-local multi-select —
// the recovered filter-then-compare wiring narrows the rows CompareView feeds
// into computePeriodComparison. Full FilterBar parity (symbol/side/playbook/…)
// stays earmarked for the flagship redesign arc; the surface is otherwise
// as-is until that arc.
export default function AnalyticsCompareTab({
  trades,
  initialRangeA,
  initialRangeB,
}: AnalyticsCompareTabProps) {
  const [rangeA, setRangeA] = useState<DateRange>(() => initialRangeA ?? rangeForPreset('thisMonth'))
  const [rangeB, setRangeB] = useState<DateRange>(() => initialRangeB ?? rangeForPreset('lastMonth'))

  // Mistake-only cross-filter (Dave #14 A). The wiring is the recovered
  // b88d290^ Reports pattern — `applyFilters(trades, { ...filters, range:
  // null })` — narrowed to the one recovered dimension (emptyFilters()
  // already carries range: null, so the period pickers keep owning dates).
  // Both periods narrow through the same rows; multi-select is a union
  // (a trade with EITHER mistake passes, applyFilters' predicate).
  const [mistakes, setMistakes] = useState<string[]>([])
  const mistakeOptions = useMemo(() => distinctMistakes(trades), [trades])
  const filteredTrades = useMemo(
    () => applyFilters(trades, { ...emptyFilters(), mistakes }),
    [trades, mistakes],
  )

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
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectMenu
          label="Mistake"
          options={mistakeOptions}
          selected={mistakes}
          onChange={setMistakes}
        />
        {mistakes.length > 0 && (
          <span className="text-[10px] text-fg-tertiary">
            both periods narrowed to trades carrying a picked mistake
          </span>
        )}
      </div>
      <CompareView
        trades={filteredTrades}
        sentimentByDate={sentimentByDate}
        rangeA={rangeA}
        rangeB={rangeB}
        onRangeChange={(which, range) => {
          if (which === 'A') setRangeA(range)
          else setRangeB(range)
        }}
        filtersActive={mistakes.length > 0}
      />
    </div>
  )
}

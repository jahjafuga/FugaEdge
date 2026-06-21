import { useEffect, useState } from 'react'
import SectionHeader from '@/components/ui/SectionHeader'
import CompareView from '@/components/reports/overview/CompareView'
import { ipc } from '@/lib/ipc'
import { rangeForPreset, type DateRange } from '@/core/performance'
import type { TradeListRow } from '@shared/trades-types'

interface AnalyticsCompareTabProps {
  trades: TradeListRow[]
}

// Beat A of the Compare promotion — the existing Reports → Overview compare
// feature, lifted into a dedicated always-on Analytics tab. Reuses CompareView
// unchanged (its period pickers + compute are self-contained) and re-creates the
// minimal glue that previously lived in reports/OverviewTab: the A/B range state
// and the per-day sentiment map. This caller is what makes CompareView a shared
// keeper before Beat B retires the Reports page.
//
// Minimal promote: passes ALL trades (the FilterBar symbol/playbook/side cross-
// filter is dropped here — reconsidered in the flagship redesign arc). The
// surface is intentionally as-is; the visual redesign is the next arc.
export default function AnalyticsCompareTab({ trades }: AnalyticsCompareTabProps) {
  const [rangeA, setRangeA] = useState<DateRange>(() => rangeForPreset('thisMonth'))
  const [rangeB, setRangeB] = useState<DateRange>(() => rangeForPreset('lastMonth'))

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
        trades={trades}
        sentimentByDate={sentimentByDate}
        rangeA={rangeA}
        rangeB={rangeB}
        onRangeChange={(which, range) => {
          if (which === 'A') setRangeA(range)
          else setRangeB(range)
        }}
      />
    </div>
  )
}

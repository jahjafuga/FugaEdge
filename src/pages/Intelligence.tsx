import { useState, useMemo } from 'react'
import PageShell from '@/components/layout/PageShell'
import HeroCards from '@/components/intelligence/HeroCards'
import TradingCoachCard from '@/components/intelligence/TradingCoachCard'
import ScoreCard from '@/components/intelligence/ScoreCard'
import RadarCard from '@/components/intelligence/RadarCard'
import WorkedLeakedSummary from '@/components/intelligence/WorkedLeakedSummary'
import EdgeStatStrip from '@/components/intelligence/EdgeStatStrip'
import TraderDnaCard from '@/components/intelligence/TraderDnaCard'
import TimeRangeToggle from '@/components/dashboard/TimeRangeToggle'
import EdgeIqMark from '@/components/icons/EdgeIqMark'
import { useInsights } from '@/lib/useInsights'
import { useEdgeScore } from '@/lib/useEdgeScore'
import { useDnaConfig } from '@/lib/useDnaConfig'
import { computeDnaAdherence } from '@/core/dna/adherence'
import { RANGE_LABEL, type TimeRange } from '@shared/dashboard-types'

// v0.2.5 EdgeIQ — the /intelligence home, top-to-bottom: the EdgeIQ mark + the
// date-range filter, the three prescriptive hero cards, the Trading Coach
// directive list, the Beat-2 flagship row (compact Edge Score beside its radar),
// then the session/week "What worked / What leaked" summary. A shared date range
// (the TimeRangeToggle, default 90D) threads into useEdgeScore + useInsights so
// the Edge Score/radar (a refetch) and the hero cards + Coach (an instant
// client-side re-filter) all reflect the chosen window. What worked/leaked is
// INTENTIONALLY independent (its own latest-week/session + Session/Week toggle).
// useInsights + useEdgeScore are lifted here (fetched once each): the insights
// array feeds the hero cards + Coach; the score result feeds the ScoreCard +
// RadarCard, so technicals aren't double-fetched.
export default function Intelligence() {
  const [range, setRange] = useState<TimeRange>('90d')
  const insightsData = useInsights(range)
  const edgeScore = useEdgeScore(range)
  const dnaConfig = useDnaConfig()
  const dna = useMemo(
    () =>
      dnaConfig.config
        ? computeDnaAdherence(insightsData.windowedTrades, dnaConfig.config)
        : null,
    [insightsData.windowedTrades, dnaConfig.config],
  )
  return (
    <PageShell>
      <div className="space-y-5">
        {/* EdgeIQ brand mark + the date-range filter. The brand stays modest
            (the TopBar breadcrumb also reads "EdgeIQ"); the toggle drives the
            Edge Score + hero cards + Coach — NOT worked/leaked, which keeps its
            own Session/Week lens. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <EdgeIqMark size={24} className="text-gold" />
            <span className="text-sm font-semibold tracking-tight text-fg-primary">EdgeIQ</span>
          </div>
          <TimeRangeToggle value={range} onChange={setRange} />
        </div>
        <HeroCards insights={insightsData.insights} loading={insightsData.loading} />
        <TradingCoachCard insights={insightsData.insights} loading={insightsData.loading} />
        {/* Multi-account RULED BOUNDARY (Option A) — the Edge Score + radar
            ride the technicals channel (useEdgeScore -> listTradesWithTechnicals)
            and stay WHOLLY GLOBAL this slice: inert-but-alive under switcher
            flips. They join the Technicals slice, which also enumerates the
            day-detail channel (electron/day). */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
          <ScoreCard {...edgeScore} rangeLabel={RANGE_LABEL[range]} />
          <RadarCard {...edgeScore} />
        </div>
        <TraderDnaCard
          data={dna}
          loading={insightsData.loading || dnaConfig.loading}
          requireCatalyst={dnaConfig.config?.dna_require_catalyst ?? false}
          rangeLabel={RANGE_LABEL[range]}
        />
        {/* Multi-account RULED BOUNDARY (Option A) — worked/leaked rides the
            day/week-detail path and stays WHOLLY GLOBAL this slice; joins the
            Technicals slice alongside the electron/day enumeration. */}
        <WorkedLeakedSummary />
        <EdgeStatStrip data={insightsData.kpis} loading={insightsData.loading} />
      </div>
    </PageShell>
  )
}

import PageShell from '@/components/layout/PageShell'
import HeroCards from '@/components/intelligence/HeroCards'
import TradingCoachCard from '@/components/intelligence/TradingCoachCard'
import ScoreCard from '@/components/intelligence/ScoreCard'
import RadarCard from '@/components/intelligence/RadarCard'
import WorkedLeakedSummary from '@/components/intelligence/WorkedLeakedSummary'
import { useInsights } from '@/lib/useInsights'
import { useEdgeScore } from '@/lib/useEdgeScore'
import EdgeIqMark from '@/components/icons/EdgeIqMark'

// v0.2.5 Edge Intelligence — the /intelligence home, top-to-bottom: the three
// prescriptive hero cards (the §F "spine"), the Trading Coach directive list
// (B3 — a check/warn/focus re-presentation of the insight output), the Beat-2
// flagship row (compact Edge Score beside its radar), then the session/week
// "What worked / What leaked" summary. The full EdgeInsightsView feed was REMOVED
// from this page (spec #7 revised — the Coach re-presents the same insights, so
// the feed duplicated them; EdgeInsightsView is untouched and still renders on
// the Dashboard). useInsights AND useEdgeScore are both lifted here (each fetched
// ONCE): the insights array feeds the hero cards + the Coach; the score result
// feeds the ScoreCard + RadarCard, so technicals aren't double-fetched.
export default function Intelligence() {
  const insightsData = useInsights()
  const edgeScore = useEdgeScore()
  return (
    <PageShell>
      <div className="space-y-5">
        {/* EdgeIQ brand mark — a slim feature identifier above the band (the
            TopBar breadcrumb also reads "EdgeIQ"; keep this modest). */}
        <div className="flex items-center gap-2">
          <EdgeIqMark size={24} className="text-gold" />
          <span className="text-sm font-semibold tracking-tight text-fg-primary">EdgeIQ</span>
        </div>
        <HeroCards insights={insightsData.insights} loading={insightsData.loading} />
        <TradingCoachCard insights={insightsData.insights} loading={insightsData.loading} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
          <ScoreCard {...edgeScore} />
          <RadarCard {...edgeScore} />
        </div>
        <WorkedLeakedSummary />
      </div>
    </PageShell>
  )
}

import PageShell from '@/components/layout/PageShell'
import HeroCards from '@/components/intelligence/HeroCards'
import TradingCoachCard from '@/components/intelligence/TradingCoachCard'
import ScoreCard from '@/components/intelligence/ScoreCard'
import RadarCard from '@/components/intelligence/RadarCard'
import WorkedLeakedSummary from '@/components/intelligence/WorkedLeakedSummary'
import { EdgeInsightsView } from '@/components/dashboard/EdgeInsights'
import { useInsights } from '@/lib/useInsights'
import { useEdgeScore } from '@/lib/useEdgeScore'

// v0.2.5 Edge Intelligence — the /intelligence home, top-to-bottom: the three
// prescriptive hero cards (the §F "spine"), the Trading Coach directive list
// (B3 — a check/warn/focus re-presentation of the insight output), the Beat-2
// flagship row (compact Edge Score beside its radar), the full insight feed, and
// the session/week "What worked / What leaked" summary. useInsights AND
// useEdgeScore are both lifted here (each fetched ONCE): the insights array feeds
// the hero cards, the Coach, and the feed; the score result feeds both the
// ScoreCard and the RadarCard, so technicals aren't double-fetched.
export default function Intelligence() {
  const insightsData = useInsights()
  const edgeScore = useEdgeScore()
  return (
    <PageShell>
      <div className="space-y-5">
        <HeroCards insights={insightsData.insights} loading={insightsData.loading} />
        <TradingCoachCard insights={insightsData.insights} loading={insightsData.loading} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
          <ScoreCard {...edgeScore} />
          <RadarCard {...edgeScore} />
        </div>
        <EdgeInsightsView {...insightsData} fullFeed />
        <WorkedLeakedSummary />
      </div>
    </PageShell>
  )
}

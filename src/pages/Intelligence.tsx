import PageShell from '@/components/layout/PageShell'
import HeroCards from '@/components/intelligence/HeroCards'
import EdgeScorePanel from '@/components/intelligence/EdgeScorePanel'
import WorkedLeakedSummary from '@/components/intelligence/WorkedLeakedSummary'
import { EdgeInsightsView } from '@/components/dashboard/EdgeInsights'
import { useInsights } from '@/lib/useInsights'

// v0.2.5 Edge Intelligence. The /intelligence home, top-to-bottom: the three
// prescriptive hero cards (Beat 3 — Biggest Edge / Biggest Leak / Focus Area,
// the §F "spine"), the Edge Score panel (Beat 2 — 0–100 composite + radar), the
// full insight feed (Beat 1), then the session/week "What worked / What leaked"
// summary (Beat 4). useInsights is lifted here so the hero cards and the feed
// share ONE fetch of the same data.
export default function Intelligence() {
  const insightsData = useInsights()
  return (
    <PageShell>
      <div className="space-y-5">
        <HeroCards insights={insightsData.insights} loading={insightsData.loading} />
        <EdgeScorePanel />
        <EdgeInsightsView {...insightsData} fullFeed />
        <WorkedLeakedSummary />
      </div>
    </PageShell>
  )
}

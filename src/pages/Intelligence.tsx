import PageShell from '@/components/layout/PageShell'
import EdgeScorePanel from '@/components/intelligence/EdgeScorePanel'
import EdgeInsights from '@/components/dashboard/EdgeInsights'

// v0.2.5 Edge Intelligence. The /intelligence home: the Edge Score panel
// (Beat 2 — 0–100 composite + 6-axis radar + published weights + the discipline
// coverage chip) above the full insight feed (Beat 1 — the pure
// src/core/insights engine in `fullFeed` mode). The three prescriptive cards
// (Biggest Edge / Biggest Leak / Focus Area) and the session/week summary land
// in Beats 3–4.
export default function Intelligence() {
  return (
    <PageShell>
      <div className="space-y-5">
        <EdgeScorePanel />
        <EdgeInsights fullFeed />
      </div>
    </PageShell>
  )
}

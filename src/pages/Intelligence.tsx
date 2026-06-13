import PageShell from '@/components/layout/PageShell'
import EdgeInsights from '@/components/dashboard/EdgeInsights'

// v0.2.5 Edge Intelligence — Beat 1 foundation. The full-feed home for the
// pure insight engine (src/core/insights), surfaced at its own /intelligence
// route via the existing EdgeInsights component in `fullFeed` mode (every
// signal, no top-5 truncation). The Edge Score + radar, the three prescriptive
// cards (Biggest Edge / Biggest Leak / Focus Area), and the session/week
// summary land in Beats 2–4; this beat is rename + route + the sample-size
// foundation, with no new analysis.
export default function Intelligence() {
  return (
    <PageShell>
      <EdgeInsights fullFeed />
    </PageShell>
  )
}

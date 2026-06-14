import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useInsights, type UseInsightsResult } from '@/lib/useInsights'
import type { InsightResult, InsightTone } from '@/core/insights'

// EDGE INSIGHTS — the surface for the renderer's pure-logic insights
// engine. Cards are color-coded by tone (positive/neutral/negative) and
// truncated to 5 by default with a "View all" expander when there's more.
//
// Empty state mirrors the existing Insight banner copy so the two cards
// read as a coherent pair when the user has no signal yet.

const VISIBLE_BY_DEFAULT = 5

// Self-fetching wrapper (Dashboard + standalone usage). On /intelligence the
// page lifts useInsights once and renders EdgeInsightsView directly, so HeroCards
// and the feed share ONE fetch of the same data.
export default function EdgeInsights({ fullFeed = false }: { fullFeed?: boolean } = {}) {
  const data = useInsights()
  return <EdgeInsightsView {...data} fullFeed={fullFeed} />
}

// Presentational feed — no hook of its own. `fullFeed` (the /intelligence page)
// renders every insight with no truncation or expander; the Dashboard preview
// keeps the top-5 + "View all" behaviour.
export function EdgeInsightsView({
  insights,
  loading,
  error,
  empty,
  fullFeed = false,
}: UseInsightsResult & { fullFeed?: boolean }) {
  const [expanded, setExpanded] = useState(false)

  if (error) {
    // Don't blow up the dashboard for an insights failure — fall back to
    // nothing so the rest of the page still renders. The console will have
    // the underlying error.
    if (typeof console !== 'undefined') console.error('[edge-intelligence]', error)
    return null
  }

  if (loading) {
    return <SkeletonShell />
  }

  if (empty) {
    return (
      <section aria-label="EdgeIQ" data-tour="edge-intelligence" className="space-y-3">
        <Header />
        <div className="rounded-lg border border-dashed border-border-subtle bg-bg-2 p-6 text-center">
          <Lightbulb size={20} strokeWidth={1.75} className="mx-auto mb-2 text-gold/60" />
          <div className="text-sm text-fg-secondary">
            Tag more trades to unlock EdgeIQ.
          </div>
          <div className="mt-1 text-xs text-fg-tertiary">
            Set catalysts, playbooks, confidence, and sentiment on your trades
            — the engine surfaces edges as soon as it has the sample size.
          </div>
        </div>
      </section>
    )
  }

  const visible = fullFeed || expanded ? insights : insights.slice(0, VISIBLE_BY_DEFAULT)
  const hasMore = !fullFeed && insights.length > VISIBLE_BY_DEFAULT

  return (
    <section aria-label="EdgeIQ" data-tour="edge-intelligence" className="space-y-3">
      <Header count={insights.length} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((ins) => (
          <InsightCard key={ins.id} insight={ins} />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            {expanded ? (
              <>
                <ChevronUp size={11} strokeWidth={2.25} />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown size={11} strokeWidth={2.25} />
                View all {insights.length} insights
              </>
            )}
          </button>
        </div>
      )}
    </section>
  )
}

function Header({ count }: { count?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
          EdgeIQ
        </h2>
        {count != null && count > 0 && (
          <span className="font-mono text-[10px] text-fg-muted tnum">
            {count} {count === 1 ? 'signal' : 'signals'} · last 90 days
          </span>
        )}
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: InsightResult }) {
  const Icon = iconFor(insight.tone)
  const borderTone =
    insight.tone === 'positive'
      ? 'border-l-win'
      : insight.tone === 'negative'
        ? 'border-l-loss'
        : 'border-l-gold'
  const iconTone =
    insight.tone === 'positive'
      ? 'text-win'
      : insight.tone === 'negative'
        ? 'text-loss'
        : 'text-gold'

  return (
    <article
      className={`flex items-start gap-3 card-premium border-l-2 p-3 transition-colors duration-150 hover:border-border ${borderTone}`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-3 ${iconTone}`}
      >
        <Icon size={14} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-fg-primary">
            {insight.title}
          </div>
          {insight.metric && (
            <div
              className={`shrink-0 font-mono text-xs font-semibold tnum ${iconTone}`}
            >
              {insight.metric}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs leading-snug text-fg-secondary">
          {insight.body}
        </p>
        {insight.n > 0 && (
          <div className="mt-1.5 font-mono text-[10px] text-fg-muted tnum">
            n = {insight.n}
          </div>
        )}
      </div>
    </article>
  )
}

function iconFor(tone: InsightTone): typeof TrendingUp {
  if (tone === 'positive') return TrendingUp
  if (tone === 'negative') return AlertTriangle
  return Sparkles
}

function SkeletonShell() {
  return (
    <section aria-label="EdgeIQ loading" className="space-y-3">
      <Header />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-[72px]" />
        ))}
      </div>
    </section>
  )
}

import { TrendingUp, AlertTriangle, Target, type LucideIcon } from 'lucide-react'
import type { InsightResult } from '@/core/insights'
import { selectHeroCards, type FocusArea } from '@/core/insights/heroCards'

// v0.2.5 Edge Intelligence Beat 3 — the prescriptive spine (§F): three hero cards
// above the Edge Score + feed. Biggest Edge (green) and Biggest Leak (red) are a
// pure selection over runAllInsightRules output; Focus Area (gold) is the fix
// derived from the SAME insight chosen as the leak. Beat 1 (flagship) skins the
// three cards onto the §11.1 premium surface with per-tone felt glows (Edge →
// green, Leak → red, Focus → gold); the icon/metric tone colors stay. Degrade-
// in-place empty states keep the 3-card layout stable. The futuristic skin
// deepens through B2–B4.

export default function HeroCards({
  insights,
  loading,
}: {
  insights: InsightResult[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[132px]" />
        ))}
      </div>
    )
  }

  const { edge, leak, focus } = selectHeroCards(insights)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ToneCard
        label="Biggest Edge"
        Icon={TrendingUp}
        glow="card-glow-green"
        iconTone="text-win"
        insight={edge}
        emptyText="No clear edge yet — keep tagging trades."
      />
      <ToneCard
        label="Biggest Leak"
        Icon={AlertTriangle}
        glow="card-glow-red"
        iconTone="text-loss"
        insight={leak}
        emptyText="No major leaks — clean book."
      />
      <FocusCard focus={focus} />
    </div>
  )
}

function Shell({
  Icon,
  iconTone,
  glow,
  label,
  children,
}: {
  Icon: LucideIcon
  iconTone: string
  glow: string
  label: string
  children: React.ReactNode
}) {
  return (
    <article
      className={`flex min-h-[132px] flex-col gap-2 card-premium ${glow} p-4`}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2.25} className={iconTone} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {label}
        </span>
      </div>
      {children}
    </article>
  )
}

function ToneCard({
  label,
  Icon,
  glow,
  iconTone,
  insight,
  emptyText,
}: {
  label: string
  Icon: LucideIcon
  glow: string
  iconTone: string
  insight: InsightResult | null
  emptyText: string
}) {
  return (
    <Shell Icon={Icon} iconTone={iconTone} glow={glow} label={label}>
      {insight === null ? (
        <div className="flex flex-1 items-center text-sm text-fg-muted">{emptyText}</div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold text-fg-primary">{insight.title}</div>
            {insight.metric && (
              <div className={`shrink-0 font-mono text-sm font-semibold tnum ${iconTone}`}>
                {insight.metric}
              </div>
            )}
          </div>
          <p className="text-xs leading-snug text-fg-secondary">{insight.body}</p>
          <div className="mt-auto pt-1 font-mono text-[10px] text-fg-muted tnum">
            based on {insight.n} trades
          </div>
        </>
      )}
    </Shell>
  )
}

function FocusCard({ focus }: { focus: FocusArea }) {
  return (
    <Shell Icon={Target} iconTone="text-gold" glow="card-glow-gold" label="Focus Area">
      {focus.leakInsight === null ? (
        <div className="flex flex-1 items-center text-sm text-fg-muted">
          No major leaks — clean book.
        </div>
      ) : (
        <>
          <div className="text-sm font-semibold text-fg-primary">{focus.action}</div>
          {focus.dollar ? (
            <p className="text-xs leading-snug text-fg-secondary">
              This pattern has cost you{' '}
              <span className="font-mono font-semibold text-loss tnum">{focus.dollar}</span> so far.
            </p>
          ) : (
            <p className="text-xs leading-snug text-fg-secondary">
              {focus.leakInsight.title}
              {focus.leakInsight.metric && (
                <>
                  {' · '}
                  <span className="font-mono font-semibold text-gold tnum">
                    {focus.leakInsight.metric}
                  </span>
                </>
              )}
            </p>
          )}
          <div className="mt-auto pt-1 font-mono text-[10px] text-fg-muted tnum">
            from your biggest leak · based on {focus.leakInsight.n} trades
          </div>
        </>
      )}
    </Shell>
  )
}

import { Check, AlertTriangle, Target, type LucideIcon } from 'lucide-react'
import type { InsightResult, InsightTone } from '@/core/insights'
import { deriveAction } from '@/core/insights/heroCards'

// v0.2.5 Edge Intelligence — Beat 3. The Trading Coach: a terse check / warn /
// focus directive list that RE-PRESENTS the existing runAllInsightRules output
// (the same `insights` array the hero cards + feed read) — no new detection, no
// engine change, purely additive. Each row = a tone icon (positive → check,
// negative → warn, neutral → focus) + the insight headline + its trailing
// imperative directive (deriveAction, reused from heroCards.ts — not re-derived).
// card-premium + a subtle gold glow so it sits first-class in the band (gold =
// the Edge accent). TOP directives only — the full feed below carries the detail.

const COACH_MAX = 6

function iconFor(tone: InsightTone): { Icon: LucideIcon; tone: string } {
  if (tone === 'positive') return { Icon: Check, tone: 'text-win' }
  if (tone === 'negative') return { Icon: AlertTriangle, tone: 'text-loss' }
  return { Icon: Target, tone: 'text-gold' } // neutral → "consider" / focus
}

export default function TradingCoachCard({
  insights,
  loading,
}: {
  insights: InsightResult[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <section aria-label="Trading Coach" className="card-premium card-glow-gold p-5">
        <div className="skeleton h-[120px]" />
      </section>
    )
  }

  const top = insights.slice(0, COACH_MAX)
  // Nothing to coach yet — the hero cards' empty states + the feed's empty state
  // already carry the page; a blank Coach card would just be noise.
  if (top.length === 0) return null

  return (
    <section aria-label="Trading Coach" className="card-premium card-glow-gold p-5">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Trading Coach
      </h2>
      <ul className="space-y-2.5">
        {top.map((ins) => {
          const { Icon, tone } = iconFor(ins.tone)
          const directive = deriveAction(ins.body)
          return (
            <li key={ins.id} className="flex items-start gap-2.5">
              <Icon size={15} strokeWidth={2.25} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
              <div className="min-w-0 text-sm leading-snug">
                <span className="font-semibold text-fg-primary">{ins.title}</span>
                {directive && <span className="text-fg-secondary"> — {directive}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

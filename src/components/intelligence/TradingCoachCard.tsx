import { Check, AlertTriangle, Target, type LucideIcon } from 'lucide-react'
import type { InsightResult, InsightTone } from '@/core/insights'
import { deriveAction, deriveFinding } from '@/core/insights/heroCards'

// v0.2.5 EdgeIQ — Beat 3 (+ specificity pass). The Trading Coach: a terse
// check / warn / focus list that RE-PRESENTS the existing runAllInsightRules
// output (the same `insights` array the hero cards read) — no new detection, no
// engine change, purely additive. Each row = a tone icon (positive → check,
// negative → warn, neutral → focus) + the headline + the real metric chip
// (ins.metric — the same string the hero cards show) + the FINDING (the body's
// first sentence: the names/numbers, deriveFinding) + the trailing DIRECTIVE
// (deriveAction). Finding + directive only (NOT the whole body) so it stays
// tight — but it IS now the only insight-detail surface on EdgeIQ (the feed was
// removed), which is why it must carry the specifics. card-premium + gold glow.

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
          const finding = deriveFinding(ins.body)
          const directive = deriveAction(ins.body)
          return (
            <li key={ins.id} className="flex items-start gap-2.5">
              <Icon size={15} strokeWidth={2.25} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
              <div className="min-w-0 text-sm leading-snug">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-fg-primary">{ins.title}</span>
                  {ins.metric && (
                    <span className={`shrink-0 font-mono text-xs font-semibold tnum ${tone}`}>
                      {ins.metric}
                    </span>
                  )}
                </div>
                <p className="text-fg-secondary">
                  {finding && <>{finding} </>}
                  {directive}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import type { PeriodWording } from '@shared/period-wording'
import { useEffect, useMemo, useState } from 'react'
import type { PeriodDetail } from '@shared/week-types'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { aggregateWeekTopics, type TopicCount } from '@/core/topics/aggregate'
import { CURATED_TERMS, type TermGroup } from '@/core/topics/terms'

// v0.2.x Phase 5 — the weekly pattern view. Re-runs the local topic matcher
// (Beat A) over the week's journal entries (Beat B) and reflects what recurred,
// BALANCED: strengths first and as prominent as the rest, struggles in a CALM
// amber (deliberately not the Mistakes tab's loss-red), context quiet and last.
// Observational — counts of the trader's OWN words across the week, never a
// verdict or a label. Pure and local: no model, no network, no storage.

type SectionTone = 'working' | 'watch' | 'context'

const SECTIONS: Record<SectionTone, { title: string; group: TermGroup; heading: string; chip: string }> = {
  // Strengths — warm gold, FIRST. Calm and inviting, not loud.
  working: {
    title: "What's working",
    group: 'process',
    heading: 'text-gold',
    chip: 'border-gold/30 bg-gold/[0.06] text-gold',
  },
  // Struggles — calm amber (--warning). Explicitly NOT loss-red: this is a
  // reflection, not a scolding.
  watch: {
    title: 'Watch for',
    group: 'pitfall',
    heading: 'text-warning',
    chip: 'border-warning/30 bg-warning/[0.07] text-warning',
  },
  // Neutral context — structural terms plus the week's tickers and setups
  // (Beat A files those under 'structure'). Quiet, last.
  context: {
    title: 'Context',
    group: 'structure',
    heading: 'text-fg-tertiary',
    chip: 'border-border bg-bg-1 text-fg-secondary',
  },
}
// Strengths first — always. The order is the frame.
const ORDER: SectionTone[] = ['working', 'watch', 'context']

function PatternSection({ tone, items }: { tone: SectionTone; items: TopicCount[] }) {
  if (items.length === 0) return null
  const s = SECTIONS[tone]
  return (
    <div className="space-y-2" data-testid={`patterns-section-${tone}`}>
      <h3 className={`text-[11px] font-semibold uppercase tracking-wider ${s.heading}`}>
        {s.title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <span
            key={`${t.category}-${t.term}`}
            className={`rounded-full border px-3 py-1 text-xs tabular-nums ${s.chip}`}
          >
            {t.term} · {t.count} {t.count === 1 ? 'day' : 'days'}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function WeekPatternsTab({
  detail,
  wording,
}: {
  detail: PeriodDetail
  /** The period's own words, supplied by whoever mounts this tab. */
  wording: PeriodWording
}) {
  // Setup names complete the vocab — load once (mirrors the Journal page); a
  // failure just means no setup chips, never an error.
  const [setupNames, setSetupNames] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    ipc
      .playbooksList()
      .then((list) => {
        if (!cancelled) setSetupNames(list.map((p) => p.name))
      })
      .catch(() => {
        if (!cancelled) setSetupNames([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const topics = useMemo(() => {
    const entries = detail.entries.map((e) => ({
      premarket: e.premarket_notes,
      postsession: e.postsession_notes,
    }))
    const tickers = detail.trades.map((t) => t.symbol)
    return aggregateWeekTopics(entries, { tickers, setups: setupNames, terms: CURATED_TERMS })
  }, [detail.entries, detail.trades, setupNames])

  return (
    <Card title={wording.patternsTitle}>
      {topics.length === 0 ? (
        <div className="text-sm text-fg-tertiary">
          {wording.patternsEmpty}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-fg-tertiary">
            {wording.patternsSubtitle}
          </p>
          {ORDER.map((tone) => (
            <PatternSection
              key={tone}
              tone={tone}
              items={topics.filter((t) => t.group === SECTIONS[tone].group)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

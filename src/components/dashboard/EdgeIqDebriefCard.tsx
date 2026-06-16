import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, Target, ArrowRight, Sparkles } from 'lucide-react'
import EdgeIqMark from '@/components/icons/EdgeIqMark'
import { useTodayEdgeScore } from '@/lib/useTodayEdgeScore'
import { useEdgeScore } from '@/lib/useEdgeScore'
import { dayRepo } from '@/data/dayRepo'
import { todayDateISO } from '@/core/session/today'
import { tierForScore, type ScoreTier } from '@/core/score/tier'
import { todayFocus } from '@/core/score/todayFocus'
import { splitWorkedLeaked, type WorkedLeakedItem } from '@/core/analytics/whatWorkedLeaked'
import { tierToneClass } from '@/components/intelligence/edgeScoreFormat'
import { signed, percent } from '@/lib/format'
import type { DayMetrics } from '@shared/day-types'

// v0.2.5 EdgeIQ daily-debrief — the dashboard's "Today's Trading Debrief" card
// (right half of the goals/debrief row). Presentational + self-contained; reuses
// the Commit-1 pure logic (tierForScore / todayFocus) + the today-scoped score
// hook, plus the existing day-detail path for today's worked/leaked. NO new IPC,
// NO fabricated numbers — every figure is real or the card shows an honest
// prompt.
//
// Score is HYBRID and honest about its window:
//   • >= 5 trades today → today's Edge Score (labeled TODAY; "Provisional" 5-19).
//   • 1-4 trades today  → today's score is suppressed, so fall back to the recent
//                         30-day Edge Score, LABELED 30-DAY so it never poses as
//                         today's.
//   • 0 trades today    → no score; the whole card is the honest no-trade prompt.
// Worked / Leaked + the focus line are always TODAY's (from the day's metrics) —
// empty/clean when the day is quiet. Today's most-used playbook (a descriptive
// daily fact, not an edge claim) sits above them.

interface ScoreView {
  value: number
  tier: ScoreTier
  /** Honest window label — 'TODAY' or '30-DAY'. */
  label: string
  provisional: boolean
}

export default function EdgeIqDebriefCard() {
  const today = useTodayEdgeScore()
  const recent = useEdgeScore('30d') // fallback when today is too thin to score
  const [day, setDay] = useState<DayMetrics | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    dayRepo
      .getDayDetail(todayDateISO(new Date()))
      .then((d) => {
        if (!cancelled) setDay(d.metrics)
      })
      .catch(() => {
        if (!cancelled) setDay(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = today.loading || day === undefined
  const n = today.result?.n ?? 0
  const noTrades = !loading && n === 0

  const { worked, leaked } =
    !loading && !noTrades && day ? splitWorkedLeaked(day) : { worked: [], leaked: [] }
  const focus = todayFocus(leaked)

  // Hybrid score: prefer today's (when scorable), else the 30-day fallback,
  // always with an honest window label. null when neither is scorable yet.
  let score: ScoreView | null = null
  if (!loading && !noTrades) {
    if (today.result && !today.result.suppressed && today.result.score !== null) {
      score = {
        value: today.result.score,
        tier: tierForScore(today.result.score),
        label: 'TODAY',
        provisional: today.result.provisional,
      }
    } else if (recent.result && !recent.result.suppressed && recent.result.score !== null) {
      score = {
        value: recent.result.score,
        tier: tierForScore(recent.result.score),
        label: '30-DAY',
        provisional: false,
      }
    }
  }

  return (
    <section
      aria-label="Today's trading debrief"
      className="card-premium card-glow-purple flex flex-col p-5"
    >
      {/* Header — the EdgeIQ mark + the tier·score, top-right. */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <EdgeIqMark size={18} className="text-gold" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">
              EdgeIQ
            </span>
          </div>
          <h2 className="mt-1 text-base font-semibold text-fg-primary">Today's Trading Debrief</h2>
        </div>
        {score && <ScoreBadge score={score} />}
      </header>

      {/* Body — swaps between the no-trade prompt and the worked/leaked debrief. */}
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="skeleton h-[176px]" />
        ) : noTrades ? (
          <EmptyDebrief />
        ) : (
          <div className="space-y-4">
            <PlaybookLine playbook={day?.mostUsedPlaybook ?? null} />
            <div className="grid grid-cols-2 gap-4">
              <DebriefColumn
                title="Worked"
                tone="win"
                items={topDistinct(worked, 3)}
                emptyText="No standout wins yet."
              />
              <DebriefColumn
                title="Leaked"
                tone="loss"
                items={topDistinct(leaked, 3)}
                emptyText="Nothing leaked — clean."
              />
            </div>
            <FocusLine focus={focus} />
          </div>
        )}
      </div>

      {/* Footer — always offers the full EdgeIQ page (route exists). */}
      <Link
        to="/intelligence"
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-1 text-xs font-semibold text-fg-secondary transition-colors duration-150 ease-out-soft hover:bg-bg-2 hover:text-fg-primary"
      >
        View Full EdgeIQ
        <ArrowRight size={14} strokeWidth={2.25} />
      </Link>
    </section>
  )
}

function ScoreBadge({ score }: { score: ScoreView }) {
  return (
    <div className="text-right">
      <div className="flex items-baseline justify-end gap-1.5">
        <span className={`text-sm font-semibold ${tierToneClass(score.tier.name)}`}>
          {score.tier.name}
        </span>
        <span className="text-fg-muted">·</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-fg-primary">
          {score.value}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-end gap-1.5">
        {score.provisional && (
          <span className="rounded border border-gold/40 bg-gold/[0.08] px-1 text-[9px] font-semibold uppercase tracking-wider text-gold">
            Provisional
          </span>
        )}
        <span className="text-[9px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {score.label}
        </span>
      </div>
    </div>
  )
}

function DebriefColumn({
  title,
  tone,
  items,
  emptyText,
}: {
  title: string
  tone: 'win' | 'loss'
  items: WorkedLeakedItem[]
  emptyText: string
}) {
  const toneText = tone === 'win' ? 'text-win' : 'text-loss'
  const ItemIcon = tone === 'win' ? Check : X
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone === 'win' ? 'bg-win' : 'bg-loss'}`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-fg-muted">{emptyText}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${it.label}-${i}`}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ItemIcon size={12} strokeWidth={2.5} className={`shrink-0 ${toneText}`} />
                <span className="truncate text-fg-primary">{it.label}</span>
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  it.netPnl !== null ? toneText : 'text-fg-tertiary'
                }`}
              >
                {it.netPnl !== null ? signed(it.netPnl) : `${it.count}×`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FocusLine({ focus }: { focus: string | null }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Target size={12} strokeWidth={2} className="text-accent-violet" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Today's Focus
        </span>
      </div>
      <p className="mt-1 text-xs text-fg-secondary">
        {focus ?? 'No clear leak today — keep the process tight.'}
      </p>
    </div>
  )
}

// Today's most-used playbook — a DESCRIPTIVE daily fact pulled straight from
// DayMetrics.mostUsedPlaybook (zero new compute). "Today's setup: <name> · N
// trades · W% win" frames the kind of trading done today; it is NOT an edge
// claim ("your best setup" / "your edge" stays the 90-day EdgeInsights' job).
// null (no playbook tagged) → an honest muted line, never a fabricated setup.
function PlaybookLine({ playbook }: { playbook: DayMetrics['mostUsedPlaybook'] }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Today's setup
        </span>
        {playbook === null ? (
          <span className="text-xs text-fg-muted">No setup tagged today.</span>
        ) : (
          <span className="text-xs text-fg-secondary">
            <span className="font-semibold text-fg-primary">{playbook.playbook}</span>
            <span className="text-fg-muted"> · </span>
            {playbookSummary(playbook)}
          </span>
        )}
      </div>
    </div>
  )
}

/** "{n} trades · {pct} win" as ONE string so the sample size always reads beside
 *  the rate (1 trade · 100% win — never a bare, inflated 100%). Win rate omitted
 *  when there were no decided trades. A plain count + rate, not an edge claim. */
function playbookSummary(p: NonNullable<DayMetrics['mostUsedPlaybook']>): string {
  const parts = [`${p.tradeCount} ${p.tradeCount === 1 ? 'trade' : 'trades'}`]
  if (p.winRate !== null) parts.push(`${percent(p.winRate, 0)} win`)
  return parts.join(' · ')
}

function EmptyDebrief() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-8 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-accent-violet/30 bg-accent-violet/[0.08]">
        <Sparkles size={18} strokeWidth={2} className="text-accent-violet" />
      </span>
      <p className="text-sm font-medium text-fg-secondary">
        No trades today yet — your debrief lands after your first fill.
      </p>
      <p className="mt-1 text-xs text-fg-muted">Import a session or log a setup to see today's edge.</p>
    </div>
  )
}

/** Compact a column to the top N DISTINCT labels — splitWorkedLeaked can list a
 *  symbol twice (its symbol-aggregate row AND the single biggest/worst-trade
 *  row); the dashboard card shows each name once (the full breakdown lives on the
 *  EdgeIQ page). Source order (best/worst-first) is preserved. */
function topDistinct(items: WorkedLeakedItem[], n: number): WorkedLeakedItem[] {
  const seen = new Set<string>()
  const out: WorkedLeakedItem[] = []
  for (const it of items) {
    if (seen.has(it.label)) continue
    seen.add(it.label)
    out.push(it)
    if (out.length === n) break
  }
  return out
}

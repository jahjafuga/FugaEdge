// v0.2.5 Phase B Session 5 — one goal card, built to the L32 broadcast bar:
// KIND + TITLE + PROGRESS readable in under a second at compressed-1080p.
// Big JetBrains Mono fraction, segmented punch-card bar for targets ≤ 40,
// no hover-required information in the primary read. Process cards are the
// visual heroes (gold-tinted border); equity cards are quieter siblings and
// the ONLY place on /profile where journal dollars may render (L28).
// Kind glyphs are the gamification register (Fluent-style emoji via the
// OS set); utility actions stay lucide flat (dual-register rule).

import { X } from 'lucide-react'
import type { GoalWithProgress } from '@shared/identity-types'
import { parseGoalConfig } from '@/core/goals/config'
import { goalIcon } from './icons'
import { fmtDollars } from '../helpers'
import { profileStrings as S } from '../strings'

const SEGMENT_MAX = 40 // L32: punch-card glanceability up to here

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

interface GoalCardProps {
  goal: GoalWithProgress
  /** L27 justCompleted — S5's subtle gold pulse; S6's celebration replaces it. */
  highlight?: boolean
  onAbandon: (id: string) => void
}

export default function GoalCard({ goal, highlight = false, onAbandon }: GoalCardProps) {
  const G = S.goals
  const isProcess = goal.kind === 'process'
  const p = goal.progress
  // Same icon source as the preset chips (icons.ts) — a card shows its
  // metric's mark (equity → TrendingUp), parsed from the stored config.
  const parsed = parseGoalConfig(goal.kind, goal.config_json)
  const Icon = goalIcon(
    goal.kind,
    parsed?.kind === 'process' ? parsed.config.metric : null,
  )

  const fraction = p ? Math.min(1, p.fraction) : 0
  const percent = p ? `${Math.round(fraction * 100)}${G.percentSuffix}` : G.corruptProgress
  const segmented = isProcess && p !== null && p.target <= SEGMENT_MAX

  return (
    <article
      data-testid="goal-card"
      data-kind={goal.kind}
      className={`relative rounded-lg border p-5 transition-shadow ${
        isProcess ? 'border-gold/40 bg-bg-2' : 'border-border-subtle bg-bg-2'
      } ${highlight ? 'ring-2 ring-gold/60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className={`mt-0.5 shrink-0 ${isProcess ? 'text-gold' : 'text-gold-dim'}`}
          size={22}
          strokeWidth={1.75}
        />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-fg-primary">
          {goal.title}
        </h3>
        <button
          type="button"
          aria-label={G.abandonAction}
          title={G.abandonAction}
          onClick={() => onAbandon(goal.id)}
          className="rounded p-1 text-fg-muted hover:bg-bg-3 hover:text-fg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* The one-second read: big mono numerals. */}
      <div className="mt-3 flex items-baseline gap-2">
        {p ? (
          isProcess ? (
            <>
              <span className="font-mono text-3xl font-bold text-fg-primary">
                {p.current}
              </span>
              <span className="font-mono text-xl text-fg-tertiary">/{p.target}</span>
            </>
          ) : (
            <>
              <span className="font-mono text-2xl font-bold text-fg-primary">
                {fmtDollars(p.current)}
              </span>
              <span className="font-mono text-base text-fg-tertiary">
                / {fmtDollars(p.target)}
              </span>
            </>
          )
        ) : (
          <span className="font-mono text-3xl font-bold text-fg-muted">
            {G.corruptProgress}
          </span>
        )}
        <span className="ml-auto text-xs text-fg-tertiary">{percent}</span>
      </div>

      {/* Progress visualization (L32): segmented ≤ 40, continuous above. */}
      <div className="mt-3" aria-hidden>
        {segmented && p ? (
          <div className="flex gap-0.5">
            {Array.from({ length: p.target }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-sm ${
                  i < p.current ? 'bg-gold' : 'bg-bg-3'
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="h-2 overflow-hidden rounded bg-bg-3">
            <div
              className="h-full rounded bg-gold transition-[width] duration-500"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* The story line a streamer reads aloud. */}
      <p className="mt-3 text-xs text-fg-tertiary">
        {G.startedPrefix}{' '}
        <span className="font-mono">{fmtDate(goal.created_at)}</span>
      </p>
    </article>
  )
}

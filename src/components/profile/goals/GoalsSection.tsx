// v0.2.5 Phase B Session 5 — the Goals section, S5's increment to /profile
// (L18/L28/L32). Active cards grid (process heroes first), a RESTRAINED
// completed strip (S6's celebration lands ON these states — reserve the
// moment), §5.11 empty state as a day-one invitation, abandon via the house
// ConfirmModal, create modal. justCompleted renders the placeholder gold
// pulse S6 replaces.

import { useEffect, useRef, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { ipc } from '@/lib/ipc'
import type { GoalsListResult } from '@shared/identity-types'
import { badgeById, challengeBadgeId } from '@/core/badges/catalog'
import { useCelebration } from '@/lib/celebration'
import GoalCard from './GoalCard'
import GoalCreateModal from './GoalCreateModal'
import { badgeIcon } from '../badges/badgeIcons'
import { profileStrings as S } from '../strings'

const PULSE_MS = 4000

export default function GoalsSection() {
  const G = S.goals
  const [data, setData] = useState<GoalsListResult | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [abandonId, setAbandonId] = useState<string | null>(null)
  const [abandonBusy, setAbandonBusy] = useState(false)
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set())
  const pulseTimer = useRef(0)
  const celebration = useCelebration()

  async function refresh() {
    const result = await ipc.goalsList()
    setData(result)
    if (result.justCompleted.length > 0) {
      // S6 (R1) — a completion is a page-wide moment, so fire the app-level
      // celebration overlay (src/lib/celebration). The gold-ring pulse + the
      // minted badge on the completed strip row are the persistent local cues.
      setPulseIds(new Set(result.justCompleted))
      celebration.fire()
      window.clearTimeout(pulseTimer.current)
      pulseTimer.current = window.setTimeout(() => setPulseIds(new Set()), PULSE_MS)
    }
  }

  useEffect(() => {
    void refresh().catch(() => setData(null))
    return () => window.clearTimeout(pulseTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmAbandon() {
    if (!abandonId) return
    setAbandonBusy(true)
    try {
      await ipc.goalsAbandon(abandonId)
      await refresh()
    } finally {
      setAbandonBusy(false)
      setAbandonId(null)
    }
  }

  // Process heroes first (L32), then equity, newest first within each.
  const active = data
    ? [...data.active].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'process' ? -1 : 1,
      )
    : []

  return (
    <section className="mt-4 rounded-lg border border-border-subtle bg-bg-2 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
          {G.heading}
        </h2>
        {data && (data.active.length > 0 || data.completed.length > 0) && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-gold-hover"
          >
            <Plus className="h-4 w-4" />
            {G.newGoal}
          </button>
        )}
      </div>

      {!data ? (
        <div className="h-32 animate-pulse rounded-md bg-bg-3" />
      ) : data.active.length === 0 && data.completed.length === 0 ? (
        /* §5.11 empty state — the day-one invitation. */
        <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-md px-6 py-12 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(rgb(212 175 55) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <Target className="h-12 w-12 text-gold/60" strokeWidth={1.5} />
          <h3 className="text-lg font-semibold text-fg-primary">
            {G.empty.headline}
          </h3>
          <p className="max-w-[360px] text-sm text-fg-tertiary">{G.empty.body}</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-accent-ink hover:bg-gold-hover"
          >
            <Plus className="h-4 w-4" />
            {G.empty.action}
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  highlight={pulseIds.has(goal.id)}
                  onAbandon={(id) => setAbandonId(id)}
                />
              ))}
            </div>
          )}

          {data.completed.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {G.completedHeading}
              </h3>
              <ul className="space-y-1.5">
                {data.completed.map((goal) => {
                  // The minted badge IS the completion mark on the card (R1) —
                  // its named catalog icon, resolved from the goal's preset_id.
                  const MintIcon = badgeIcon(
                    badgeById(challengeBadgeId(goal.preset_id))?.icon ?? 'Award',
                  )
                  return (
                    <li
                      key={goal.id}
                      data-testid="completed-goal"
                      className={`flex items-center gap-2 rounded-md border border-gold/25 bg-bg-2 px-3 py-2 text-sm ${
                        pulseIds.has(goal.id) ? 'ring-2 ring-gold/60' : ''
                      }`}
                    >
                      <MintIcon
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-gold"
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1 truncate text-fg-secondary">
                        {goal.title}
                      </span>
                      {goal.completed_at && (
                        <span className="font-mono text-xs text-fg-tertiary">
                          {goal.completed_at.slice(0, 10)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <GoalCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void refresh()}
      />
      <ConfirmModal
        open={abandonId !== null}
        onClose={() => setAbandonId(null)}
        title={G.abandonTitle}
        body={<p className="text-sm text-fg-secondary">{G.abandonBody}</p>}
        confirmLabel={G.abandonConfirm}
        busy={abandonBusy}
        tone="destructive"
        onConfirm={() => void confirmAbandon()}
      />
    </section>
  )
}

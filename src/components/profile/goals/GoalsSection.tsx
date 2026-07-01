// v0.2.5 Phase B Session 5 — the Goals section, S5's increment to /profile
// (L18/L28/L32). Active cards grid (process heroes first), a RESTRAINED
// completed strip (S6's celebration lands ON these states — reserve the
// moment), §5.11 empty state as a day-one invitation, abandon via the house
// ConfirmModal, create modal. justCompleted renders the placeholder gold
// pulse S6 replaces.
//
// Profile Slice 3 — the empty state now surfaces tappable PRESET STARTERS that
// open the create modal pre-filled. Only the four PROCESS presets show here:
// equity presets carry dollar text, which the L28 invariant confines to the
// modal's equity chips + equity goal cards (never the /profile page body).

import { useEffect, useRef, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { ipc } from '@/lib/ipc'
import type { GoalsListResult } from '@shared/identity-types'
import { badgeById, challengeBadgeId } from '@/core/badges/catalog'
import { GOAL_PRESETS, type ProcessPreset } from '@/core/goals/config'
import { useCelebration } from '@/lib/celebration'
import GoalCard from './GoalCard'
import GoalCreateModal from './GoalCreateModal'
import { goalIcon } from './icons'
import { badgeIcon } from '../badges/badgeIcons'
import { profileStrings as S } from '../strings'

const PULSE_MS = 4000

// Empty-state starters — the four PROCESS presets (dollar-free; see L28 note in
// the header comment). Tapping one opens the create modal pre-filled.
const PROCESS_STARTERS: ReadonlyArray<ProcessPreset> = GOAL_PRESETS.filter(
  (p): p is ProcessPreset => p.kind === 'process',
)

export default function GoalsSection() {
  const G = S.goals
  const [data, setData] = useState<GoalsListResult | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPresetId, setCreatePresetId] = useState<string | null>(null)
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

  // Open the create modal, optionally pre-filled with a preset starter.
  function openWithPreset(presetId: string) {
    setCreatePresetId(presetId)
    setCreateOpen(true)
  }
  function openBlank() {
    setCreatePresetId(null)
    setCreateOpen(true)
  }

  // Process heroes first (L32), then equity, newest first within each.
  const active = data
    ? [...data.active].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'process' ? -1 : 1,
      )
    : []

  return (
    <section className="mt-4 card-premium p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
          {G.heading}
        </h2>
        {data && (data.active.length > 0 || data.completed.length > 0) && (
          <button
            type="button"
            onClick={openBlank}
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
        /* §5.11 empty state — the day-one invitation, now with preset starters. */
        <div className="relative overflow-hidden rounded-md px-6 py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(rgb(212 175 55) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <Target className="h-10 w-10 text-gold/60" strokeWidth={1.5} />
            <div>
              <h3 className="text-lg font-semibold text-fg-primary">
                {G.empty.headline}
              </h3>
              <p className="mx-auto mt-1 max-w-[420px] text-sm text-fg-tertiary">
                {G.empty.body}
              </p>
            </div>

            {/* Preset starters — tap to open the create modal pre-filled. */}
            <div className="mt-1 grid w-full max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
              {PROCESS_STARTERS.map((p) => {
                const Icon = goalIcon('process', p.metric)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openWithPreset(p.id)}
                    className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-3 px-3 py-2.5 text-left transition-all duration-150 ease-out-soft hover:-translate-y-0.5 hover:border-gold-dim hover:shadow-md"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/[0.12]">
                      <Icon aria-hidden className="text-gold" size={16} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg-primary">
                        {G.create.presetTitles[p.id] ?? p.id}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-fg-tertiary">
                        {p.target} {G.create.presetMeta[p.metric]}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Secondary — start from scratch (no preset). */}
            <button
              type="button"
              onClick={openBlank}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-fg-tertiary transition-colors duration-150 hover:text-gold"
            >
              <Plus className="h-3.5 w-3.5" />
              {G.empty.action}
            </button>
          </div>
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
        initialPresetId={createPresetId}
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

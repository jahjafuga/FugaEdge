// v0.2.5 Phase B Session 6 (R3/R4) — the badge wall + featured-3 picker.
// Renders the WHOLE catalog GROUPED by category (Process / Milestones /
// Challenges), each with a per-group earned count so it reads as a board with
// "areas to complete". Earned badges read as gold achievements; LOCKED badges
// read as aspirational TARGETS — a defined, full-opacity tile with a legible
// monochrome icon + the threshold goal (never a fake progress bar; per-badge
// progress is a deferred arc). Tapping an earned badge features it (cap 3,
// UI-enforced; updateProfile rejects >3 defensively).

import { useEffect, useState } from 'react'
import { Lock, Star } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import type { BadgeAward, BadgeTier } from '@shared/identity-types'
import { BADGE_CATALOG, type BadgeDef } from '@/core/badges/catalog'
import { badgeIcon } from './badgeIcons'
import { profileStrings as S } from '../strings'

interface DefState {
  def: BadgeDef
  earned: boolean
  highestTier: BadgeTier | null
  lockedHint: string
}

function evaluate(def: BadgeDef, earnedKeys: Set<string>): DefState {
  const key = (t: BadgeTier | null) => `${def.id}|${t ?? ''}`
  let highestTier: BadgeTier | null = null
  let earned = false
  for (const g of def.grades) {
    if (earnedKeys.has(key(g.tier))) {
      earned = true
      if (g.tier) highestTier = g.tier // grades are copper→silver→gold ascending
    }
  }
  const nextGrade = def.grades.find((g) => !earnedKeys.has(key(g.tier)))
  const lockedHint =
    nextGrade && nextGrade.threshold > 0 && def.unit
      ? `${nextGrade.threshold} ${def.unit}`
      : S.badges.locked
  return { def, earned, highestTier, lockedHint }
}

// The board's sections, in order. Labels live in strings (D16).
const CATEGORY_ORDER: ReadonlyArray<BadgeDef['category']> = [
  'process',
  'milestone',
  'challenge',
]

interface BadgeWallProps {
  featured: string[]
  onSetFeatured: (next: string[]) => void
}

export default function BadgeWall({ featured, onSetFeatured }: BadgeWallProps) {
  const B = S.badges
  const [awards, setAwards] = useState<BadgeAward[] | null>(null)

  useEffect(() => {
    ipc.badgesList().then(setAwards).catch(() => setAwards([]))
  }, [])

  if (!awards) {
    return (
      <section className="mt-4 card-premium p-6">
        <div className="h-40 animate-pulse rounded-md bg-bg-3" />
      </section>
    )
  }

  const earnedKeys = new Set(awards.map((a) => `${a.badge_id}|${a.tier ?? ''}`))
  const states = BADGE_CATALOG.map((def) => evaluate(def, earnedKeys))
  const totalGrades = BADGE_CATALOG.reduce((n, d) => n + d.grades.length, 0)
  const earnedGrades = BADGE_CATALOG.reduce(
    (n, d) => n + d.grades.filter((g) => earnedKeys.has(`${d.id}|${g.tier ?? ''}`)).length,
    0,
  )
  const featuredStates = featured
    .map((id) => states.find((s) => s.def.id === id))
    .filter((s): s is DefState => Boolean(s))

  function toggleFeatured(defId: string) {
    if (featured.includes(defId)) {
      onSetFeatured(featured.filter((id) => id !== defId))
    } else if (featured.length < 3) {
      onSetFeatured([...featured, defId])
    }
    // cap reached → ignored; the chip is non-interactive + the hint explains.
  }

  // Per-category grade counts — consistent with the overall earned/total header.
  function gradeCount(category: BadgeDef['category']): { earned: number; total: number } {
    let earned = 0
    let total = 0
    for (const d of BADGE_CATALOG) {
      if (d.category !== category) continue
      for (const g of d.grades) {
        total++
        if (earnedKeys.has(`${d.id}|${g.tier ?? ''}`)) earned++
      }
    }
    return { earned, total }
  }

  return (
    <section className="mt-4 card-premium p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
          {B.heading}
        </h2>
        <span className="font-mono text-xs text-fg-tertiary">
          {earnedGrades} / {totalGrades} {B.earnedWord}
        </span>
      </div>

      {/* Featured shelf — the ≤3 picked, the strongest treatment (trophy shelf). */}
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {B.featuredHeading}
        </h3>
        {featuredStates.length === 0 ? (
          <p className="text-sm text-fg-muted">{B.emptyFeatured}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {featuredStates.map((s) => {
              const Icon = badgeIcon(s.def.icon)
              return (
                <div
                  key={s.def.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-gold bg-gold/[0.12] px-3 py-2 shadow-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/[0.18]">
                    <Icon className="h-4 w-4 text-gold" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-semibold text-fg-primary">{s.def.name}</span>
                  {s.highestTier && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gold/80">
                      {B.tierLabels[s.highestTier]}
                    </span>
                  )}
                  <Star aria-hidden className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" strokeWidth={1.75} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* The catalog, grouped by category — each a labeled board section. */}
      <div className="space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const group = states.filter((s) => s.def.category === category)
          if (group.length === 0) return null
          const { earned, total } = gradeCount(category)
          return (
            <div key={category}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                  {B.categoryLabels[category]}
                </h3>
                <span className="font-mono text-[11px] text-fg-tertiary">
                  {earned} / {total}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {group.map((s) => {
                  const Icon = badgeIcon(s.def.icon)
                  const isFeatured = featured.includes(s.def.id)
                  const capBlocked = !isFeatured && featured.length >= 3
                  return (
                    <button
                      key={s.def.id}
                      type="button"
                      data-earned={s.earned}
                      disabled={!s.earned || capBlocked}
                      aria-pressed={isFeatured}
                      title={
                        s.earned
                          ? capBlocked
                            ? B.capReached
                            : s.def.description
                          : `${B.locked} — ${s.def.description}`
                      }
                      onClick={() => toggleFeatured(s.def.id)}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ease-out-soft ${
                        isFeatured
                          ? 'border-gold bg-gold/[0.12] shadow-sm'
                          : s.earned
                            ? 'border-gold/40 bg-gold/[0.06] hover:border-gold/70 disabled:hover:border-gold/40'
                            : 'border-border-subtle bg-bg-3'
                      } ${s.earned && !capBlocked ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          s.earned ? 'bg-gold/[0.16]' : 'bg-bg-1'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${s.earned ? 'text-gold' : 'text-fg-tertiary'}`}
                          strokeWidth={1.75}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg-primary">
                          {s.def.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 font-mono text-xs text-fg-tertiary">
                          {!s.earned && <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />}
                          <span className="truncate">
                            {s.earned
                              ? s.highestTier
                                ? B.tierLabels[s.highestTier]
                                : B.earnedWord
                              : s.lockedHint}
                          </span>
                        </span>
                      </span>
                      {isFeatured && (
                        <Star
                          aria-hidden
                          className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 fill-gold text-gold"
                          strokeWidth={1.75}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-fg-muted">{B.pickHint}</p>
    </section>
  )
}

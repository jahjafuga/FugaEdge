// v0.2.5 Phase B Session 6 (R3/R4) — the badge wall + featured-3 picker. The
// flagship visual surface (D26): renders the WHOLE catalog — earned in gold,
// locked dimmed with a threshold hint — so it reads as a goal board from day
// one, even though only challenge badges can be earned this session
// (threshold-minting is a deferred beat, recorded in D27). Tapping an earned
// badge features it (cap 3, UI-enforced; updateProfile rejects >3 defensively).

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
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

      {/* Featured strip — the ≤3 picked, rendered prominently. */}
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
                  className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/[0.08] px-3 py-2"
                >
                  <Icon className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} />
                  <span className="text-sm font-semibold text-fg-primary">{s.def.name}</span>
                  {s.highestTier && (
                    <span className="text-xs text-fg-tertiary">{B.tierLabels[s.highestTier]}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* The full catalog grid — earned (gold, tappable) + locked (dimmed). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {states.map((s) => {
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
              className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all duration-150 ease-out-soft ${
                isFeatured
                  ? 'border-gold bg-gold/[0.10]'
                  : s.earned
                    ? 'border-border-subtle bg-bg-4 hover:border-gold-dim disabled:hover:border-border-subtle'
                    : 'border-border-subtle bg-bg-1 opacity-55'
              } ${s.earned && !capBlocked ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <Icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${s.earned ? 'text-gold' : 'text-fg-muted'}`}
                strokeWidth={1.75}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg-primary">
                  {s.def.name}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-fg-tertiary">
                  {s.earned ? (s.highestTier ? B.tierLabels[s.highestTier] : B.earnedWord) : s.lockedHint}
                </span>
              </span>
              {isFeatured && (
                <Star aria-hidden className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 fill-gold text-gold" strokeWidth={1.75} />
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-fg-muted">{B.pickHint}</p>
    </section>
  )
}

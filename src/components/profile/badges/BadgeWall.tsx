// v0.2.5 Phase B Session 6 (R3/R4) — the badge wall + featured-3 picker.
// Renders the WHOLE catalog GROUPED by category (Process / Milestones /
// Challenges), each with a per-group earned count so it reads as a board with
// "areas to complete". Earned badges read as gold achievements; LOCKED badges
// read as aspirational TARGETS — a defined, full-opacity tile with a legible
// monochrome icon + the threshold goal (never a fake progress bar; per-badge
// progress is a deferred arc). Tapping an earned badge features it (cap 3,
// UI-enforced; updateProfile rejects >3 defensively).

import { Lock, Star } from 'lucide-react'
import type { BadgeAward, BadgeTier, NewlyMinted } from '@shared/identity-types'
import { BADGE_CATALOG, type BadgeDef } from '@/core/badges/catalog'
import BadgeCrest from './BadgeCrest'
import { badgeIcon } from './badgeIcons'
import { metalFor, METAL } from './tierMetal'
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
  // The rider (Arc 2 beat 2): thousands separators on the threshold —
  // '1,000,000 peak profit ($)'; small counts unchanged by construction.
  const lockedHint =
    nextGrade && nextGrade.threshold > 0 && def.unit
      ? `${nextGrade.threshold.toLocaleString('en-US')} ${def.unit}`
      : S.badges.locked
  return { def, earned, highestTier, lockedHint }
}

// The board's sections, in order. Labels live in strings (D16).
const CATEGORY_ORDER: ReadonlyArray<BadgeDef['category']> = [
  'process',
  'milestone',
  'challenge',
]

// Tier-metal styling (metalFor + METAL, the copper/silver/gold classes) is
// shared with the avatar emblem — see ./tierMetal. The locked treatment stays
// here (wall-specific, tier-independent neutral grey). Arc 2 beat 1: locked
// RECEDES — quieter border and fill, dimmed icon — so earned metal carries
// the room; the milestone rungs sit dormant-neutral until gold on earn.
const LOCKED_TILE = 'border-border-subtle/60 bg-bg-3/60'
const LOCKED_DISC = 'bg-bg-1/80'
const LOCKED_ICON = 'text-fg-muted'

interface BadgeWallProps {
  featured: string[]
  onSetFeatured: (next: string[]) => void
  /** Fed by the Profile page's single mint:true fetch — one mint, one awards
   *  source (no self-fetch race with Profile's mint). */
  awards: BadgeAward[]
  /** Grades minted THIS Profile open — the tiles to pulse (staggered cascade). */
  newlyMinted: NewlyMinted[]
}

export default function BadgeWall({
  featured,
  onSetFeatured,
  awards,
  newlyMinted,
}: BadgeWallProps) {
  const B = S.badges

  const earnedKeys = new Set(awards.map((a) => `${a.badge_id}|${a.tier ?? ''}`))
  // Which catalog badges have a grade newly minted this open (-> pulse), plus a
  // stable cascade index across that set for the staggered animation-delay.
  const newlyMintedIds = new Set(newlyMinted.map((n) => n.badge_id))
  const cascadeIndex = new Map<string, number>()
  BADGE_CATALOG.forEach((d) => {
    if (newlyMintedIds.has(d.id)) cascadeIndex.set(d.id, cascadeIndex.size)
  })
  const states = BADGE_CATALOG.map((def) => evaluate(def, earnedKeys))
  const totalGrades = BADGE_CATALOG.reduce((n, d) => n + d.grades.length, 0)
  const earnedGrades = BADGE_CATALOG.reduce(
    (n, d) => n + d.grades.filter((g) => earnedKeys.has(`${d.id}|${g.tier ?? ''}`)).length,
    0,
  )
  function toggleFeatured(defId: string) {
    // Single-select pin: clicking the pinned badge clears it; any other earned
    // badge replaces the pin. featured is always [] or [id].
    onSetFeatured(featured.includes(defId) ? [] : [defId])
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-tertiary">
          {B.heading}
        </h2>
        <span className="font-mono text-xs text-fg-tertiary tnum">
          {earnedGrades} / {totalGrades} {B.earnedWord}
        </span>
      </div>

      {/* The catalog, grouped by category — each a labeled board section. Tapping
          an earned tile pins it as the single featured badge (the Star marks it). */}
      <div className="space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const group = states.filter((s) => s.def.category === category)
          if (group.length === 0) return null
          const { earned, total } = gradeCount(category)
          return (
            <div key={category}>
              {/* Section header — the 3.5 micro-label voice; the count sits
                  right-aligned in tabular figures. Label STRINGS unchanged. */}
              <div className="mb-2 flex items-baseline justify-between border-b border-border-subtle/60 pb-1.5">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-secondary">
                  {B.categoryLabels[category]}
                </h3>
                <span className="font-mono text-[11px] text-fg-tertiary tnum">
                  {earned} / {total}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {group.map((s) => {
                  const Icon = badgeIcon(s.def.icon)
                  const isFeatured = featured.includes(s.def.id)
                  const isNewlyMinted = s.earned && newlyMintedIds.has(s.def.id)
                  const m = METAL[metalFor(s.highestTier)]
                  return (
                    <button
                      key={s.def.id}
                      type="button"
                      data-earned={s.earned}
                      disabled={!s.earned}
                      aria-pressed={isFeatured}
                      title={
                        s.earned
                          ? s.def.description
                          : `${B.locked} — ${s.def.description}`
                      }
                      onClick={() => toggleFeatured(s.def.id)}
                      className={`group relative flex min-h-[64px] items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ease-out-soft ${
                        isFeatured ? m.featured : s.earned ? m.earned : LOCKED_TILE
                      } ${s.earned ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {/* Hover shine sweep (featured only) — clipped inner layer,
                          separate from the non-clipped pulse below. */}
                      {isFeatured && (
                        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                          <span className="badge-shine-sweep absolute inset-0 -translate-x-[120%] transition-transform duration-700 ease-out group-hover:translate-x-[120%]" />
                        </span>
                      )}
                      {/* On-earn pulse (this tile just minted) — a gold bloom on a
                          NON-clipped layer (it scales past the tile); staggered. */}
                      {isNewlyMinted && (
                        <span
                          className="badge-earn-pulse"
                          style={{ animationDelay: `${(cascadeIndex.get(s.def.id) ?? 0) * 80}ms` }}
                          aria-hidden
                        />
                      )}
                      <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                        {s.earned && (
                          <BadgeCrest
                            className={`pointer-events-none absolute inset-0 h-full w-full ${m.crest}`}
                          />
                        )}
                        <span
                          className={`relative flex items-center justify-center rounded-full ${
                            s.earned ? `h-6 w-6 ${m.coin}` : `h-8 w-8 ${LOCKED_DISC}`
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${s.earned ? m.icon : LOCKED_ICON}`}
                            strokeWidth={1.75}
                          />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg-primary">
                          {s.def.name}
                        </span>
                        {/* Earned: the tier word in the metal's voice. Locked:
                            the requirement hint in the micro-label voice — the
                            hint TEXT itself is unchanged (pinned copy). */}
                        <span
                          className={`mt-0.5 flex items-center gap-1 ${
                            s.earned
                              ? 'font-mono text-xs text-fg-tertiary'
                              : 'text-[10px] uppercase tracking-wider text-fg-muted'
                          }`}
                        >
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
                          className={`ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 ${m.star}`}
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

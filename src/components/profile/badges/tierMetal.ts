// Shared badge tier-metal styling — extracted from BadgeWall so the avatar
// emblem (ProfileHero / AccountMenu) reuses the copper/silver/gold color without
// duplicating it. Untiered badges (tier null — milestones, challenges, single-
// grade) map to gold, the top achievement metal. LITERAL Tailwind strings (no
// interpolation, so the JIT keeps them); only gold carries the shine.

import type { BadgeAward, BadgeTier } from '@shared/identity-types'
import { badgeById } from '@/core/badges/catalog'

export type Metal = 'copper' | 'silver' | 'gold'

export function metalFor(tier: BadgeTier | null): Metal {
  return tier === 'copper' ? 'copper' : tier === 'silver' ? 'silver' : 'gold'
}

export interface MetalClasses {
  earned: string
  featured: string
  disc: string
  discFeatured: string
  icon: string
  label: string
  star: string
}

export const METAL: Record<Metal, MetalClasses> = {
  copper: {
    earned: 'border-copper/40 bg-copper/[0.06] hover:border-copper/70 disabled:hover:border-copper/40',
    featured: 'border-copper bg-copper/[0.12] shadow-sm',
    disc: 'bg-copper/[0.16]',
    discFeatured: 'bg-copper/[0.18]',
    icon: 'text-copper',
    label: 'text-copper/80',
    star: 'fill-copper text-copper',
  },
  silver: {
    earned: 'border-silver/50 bg-silver/[0.07] hover:border-silver/80 disabled:hover:border-silver/50',
    featured: 'border-silver bg-silver/[0.14] shadow-sm',
    disc: 'bg-silver/[0.18]',
    discFeatured: 'bg-silver/[0.20]',
    icon: 'text-silver',
    label: 'text-silver/80',
    star: 'fill-silver text-silver',
  },
  gold: {
    earned: 'border-gold/50 bg-gold/[0.08] hover:border-gold/80 disabled:hover:border-gold/50 card-glow-gold',
    featured: 'border-gold bg-gold/[0.12] shadow-sm card-glow-gold',
    disc: 'bg-gold/[0.16]',
    discFeatured: 'bg-gold/[0.18]',
    icon: 'text-gold',
    label: 'text-gold/80',
    star: 'fill-gold text-gold',
  },
}

/** Emblem-only palette per tier — the icon color, a container border tint, and a
 *  solid dot fill. Simpler than METAL's full tile set; the avatar emblem (hero)
 *  and the toolbar dot use just these. */
export function tierColor(tier: BadgeTier | null): {
  icon: string
  ring: string
  dot: string
} {
  const m = metalFor(tier)
  if (m === 'copper') return { icon: 'text-copper', ring: 'border-copper/70', dot: 'bg-copper' }
  if (m === 'silver') return { icon: 'text-silver', ring: 'border-silver/70', dot: 'bg-silver' }
  return { icon: 'text-gold', ring: 'border-gold/70', dot: 'bg-gold' }
}

export interface FeaturedEmblem {
  /** Lucide icon NAME — resolve via badgeIcon. */
  icon: string
  /** Strongest earned tier (null = untiered -> gold). */
  tier: BadgeTier | null
}

/** Resolve the single featured badge (featured[0]) to its emblem: the catalog
 *  icon + the strongest earned tier from the awards. null if nothing is featured
 *  or the id isn't a catalog badge. */
export function featuredEmblem(
  featured: string[],
  awards: BadgeAward[],
): FeaturedEmblem | null {
  const id = featured[0]
  if (!id) return null
  const def = badgeById(id)
  if (!def) return null
  const RANK: Record<string, number> = { copper: 1, silver: 2, gold: 3 }
  let tier: BadgeTier | null = null
  let best = 0
  for (const a of awards) {
    if (a.badge_id !== id) continue
    const r = a.tier ? RANK[a.tier] : 0
    if (r > best) {
      best = r
      tier = a.tier
    }
  }
  return { icon: def.icon, tier }
}

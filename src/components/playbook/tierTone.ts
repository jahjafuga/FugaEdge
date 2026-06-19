import type { PlaybookTier } from '@shared/playbook-types'

// The single source of truth for a graded tier's chip colour (border + bg tint
// + text). Both TierBadge and the Setup-editor tier picker call this so they can
// never drift (they previously kept two inline copies — the badge used
// text-fg-secondary, the picker text-fg-primary).
//
// v0.2.5 re-tone — A+ → A → B → C as a four-hue gradient:
//   A+ → gold (--gold, brand accent — best-of-best)
//   A  → win green (--win)
//   B  → teal (--accent-teal, a distinct "solid" grade)
//   C  → amber (--tier-c, orange-leaning — a downgrade, NOT red)
//
// RED (--loss) and GREY are DELIBERATELY absent here: red is reserved for P&L
// (pnlClass) and grey for the ungraded No-Setup chip (SystemTierChip). The
// alpha weights step down with grade (A+ strongest → C softest); the hue, not
// the weight, carries the distinction.
const TIER_TONE: Record<PlaybookTier, string> = {
  'A+': 'border-gold/60 bg-gold/[0.14] text-gold',
  A: 'border-win/50 bg-win/[0.12] text-win',
  B: 'border-accent-teal/50 bg-accent-teal/[0.12] text-accent-teal',
  C: 'border-tier-c/40 bg-tier-c/[0.10] text-tier-c',
}

/** The graded chip tone (border + bg + text classes) for a tier. Pure — no
 *  React, no DOM. Total over PlaybookTier, so there is no fallthrough. */
export function tierTone(tier: PlaybookTier): string {
  return TIER_TONE[tier]
}

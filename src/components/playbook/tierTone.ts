import type { PlaybookTier } from '@shared/playbook-types'

// The single source of truth for a graded tier's chip colour (border + bg tint
// + text). Both TierBadge and the Setup-editor tier picker call this so they can
// never drift (they previously kept two inline copies — the badge used
// text-fg-secondary, the picker text-fg-primary).
//
// The medal scheme (djsevans87, 2026-07-05 — replaces the v0.2.5 four-hue re-tone):
//   A+ → gold   (--gold, brand accent — best-of-best)
//   A  → silver (--silver, the badge-coin metal token)
//   B  → bronze (--copper, the badge-coin metal token)
//   C  → amber  (--tier-c, orange-leaning — a downgrade, NOT red)
//
// A is silver, NOT green: A used to be text-win — the SAME token pnlClass paints profit in
// (src/lib/format.ts) — a grade wearing the money colour. Silver removes that borrow. B is
// bronze, NOT teal: teal sat right next to A's green and the two grades blurred into one
// colour (djsevans87's report). C stays amber and is NEVER red: red is --loss, and a red C
// badge would collide with the red P&L / expectancy numbers on C's own row — the exact
// collision commit 10daef7 removed. GREEN (--win) and RED (--loss) are money-only; GREY is
// the No-Setup chip's language (SystemTierChip). The alpha weights step down with grade (A+
// strongest → C softest); the hue, not the weight, carries the distinction. tierTone.test.ts
// pins each tier AND a structural guard that no tier may ever reuse a pnlClass colour.
const TIER_TONE: Record<PlaybookTier, string> = {
  'A+': 'border-gold/60 bg-gold/[0.14] text-gold',
  A: 'border-silver/50 bg-silver/[0.12] text-silver',
  B: 'border-copper/50 bg-copper/[0.12] text-copper',
  C: 'border-tier-c/40 bg-tier-c/[0.10] text-tier-c',
}

/** The graded chip tone (border + bg + text classes) for a tier. Pure — no
 *  React, no DOM. Total over PlaybookTier, so there is no fallthrough. */
export function tierTone(tier: PlaybookTier): string {
  return TIER_TONE[tier]
}

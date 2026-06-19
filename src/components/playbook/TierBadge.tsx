import type { PlaybookTier } from '@shared/playbook-types'
import { tierTone } from './tierTone'

interface TierBadgeProps {
  tier: PlaybookTier
  /** Inline badges in list rows / table cells. The default size suits a
   *  10–11px chrome cluster; `lg` is for the picker / hero badge. */
  size?: 'sm' | 'lg'
  className?: string
}

// Setup quality tier — A+ → A → B → C. Colours come from the shared tierTone()
// helper so this badge and the Setup-editor tier picker never drift. Theme-
// locked graded gradient:
//   A+ → gold (the brand accent — best-of-best)
//   A  → win green
//   B  → teal (a distinct "solid" grade — no longer neutral grey)
//   C  → amber (orange-leaning downgrade — no longer red)
// RED is reserved for P&L; GREY for the ungraded No-Setup chip.
//
// Word badge per the v0.1.4 typography rule — sans-serif uppercase.
export default function TierBadge({ tier, size = 'sm', className = '' }: TierBadgeProps) {
  const tone = tierTone(tier)

  const sz =
    size === 'lg'
      ? 'h-6 px-2 text-[11px]'
      : 'h-[18px] px-1.5 text-[10px]'

  return (
    <span
      title={`Tier ${tier}`}
      className={`inline-flex shrink-0 items-center rounded-sm border font-semibold uppercase tracking-wider ${sz} ${tone} ${className}`}
    >
      {tier}
    </span>
  )
}

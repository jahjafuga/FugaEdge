import type { PlaybookTier } from '@shared/playbook-types'

interface TierBadgeProps {
  tier: PlaybookTier
  /** Inline badges in list rows / table cells. The default size suits a
   *  10–11px chrome cluster; `lg` is for the picker / hero badge. */
  size?: 'sm' | 'lg'
  className?: string
}

// Setup quality tier — A+ → A → B → C. Colors are theme-locked so the badge
// reads the same in dark and light mode:
//   A+ → gold (the brand accent — best-of-best)
//   A  → win green
//   B  → neutral gray (the default; un-graded setups land here)
//   C  → dim red (deliberate downgrade)
//
// Word badge per the v0.1.4 typography rule — sans-serif uppercase.
export default function TierBadge({ tier, size = 'sm', className = '' }: TierBadgeProps) {
  const tone =
    tier === 'A+'
      ? 'border-gold/60 bg-gold/[0.14] text-gold'
      : tier === 'A'
        ? 'border-win/50 bg-win/[0.12] text-win'
        : tier === 'C'
          ? 'border-loss/40 bg-loss/[0.10] text-loss'
          : 'border-border-strong bg-bg-3 text-fg-secondary'

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

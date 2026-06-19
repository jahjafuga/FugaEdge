// Beat 4b — Library-only chip for a SYSTEM playbook's (No Setup's) ungraded
// state. Renders "N/A" in a neutral / muted tone — deliberately NOT a grade
// color and NOT loss-red: No Setup is UNGRADED, not a bad grade. Visual weight
// (height / padding / type) matches TierBadge's `sm` size so the list row stays
// aligned. The stored tier ('C', the inert Beat-1 placeholder) is never
// surfaced here — this is a render-time override.
export default function SystemTierChip({ className = '' }: { className?: string }) {
  return (
    <span
      title="System playbook — not graded"
      className={`inline-flex h-[18px] shrink-0 items-center rounded-sm border border-border-subtle bg-bg-2 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary ${className}`}
    >
      N/A
    </span>
  )
}

// Section-scoped exclusion chip for the MACD State band — the count of
// data-complete trades whose rising/falling axis couldn't be determined on the
// toggled timeframe (no prior histogram bar, §A3 first-bar case). Distinct from
// the tab-global excluded-data chip in the filter bar: that one counts data-gate
// failures; this one is MACD-section + timeframe specific. Rides the Section 2
// SectionHeader's `right` slot. Self-gating (null at 0) as a defensive layer;
// TechnicalsTab also passes undefined when count is 0.
//
// Token shell mirrors the Commit 6b excluded-data chip verbatim (neutral
// rounded-full pill) so the two read as the same family.

interface UnclassifiedChipProps {
  count: number
}

export default function UnclassifiedChip({ count }: UnclassifiedChipProps) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
      {count} excluded from this split (no prior bar)
    </span>
  )
}

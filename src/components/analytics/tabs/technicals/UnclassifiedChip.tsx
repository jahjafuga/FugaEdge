// Section-scoped exclusion chip for the distance / state bands — the count of
// data-complete trades that couldn't be placed on the toggled timeframe, with a
// per-section `reason` naming the axis that was null: MACD's "signal not
// settled", VWAP's "no vwap data", EMA's "no 9 ema data". Distinct from the
// tab-global excluded-data chip in the filter bar: that one counts data-gate
// failures; this one is section + timeframe specific. Rides each band's
// SectionHeader `right` slot. Self-gating (null at 0) as a defensive layer;
// TechnicalsTab also passes undefined when the count is 0.
//
// Token shell mirrors the Commit 6b excluded-data chip verbatim (neutral
// rounded-full pill) so the two read as the same family.

interface UnclassifiedChipProps {
  count: number
  /** The parenthetical reason, section-specific. The CSS uppercases it, so pass
   *  lowercase. Defaults to MACD's wording (its call is unchanged): with the
   *  second axis now open/closed, what keeps a trade out of the split is a
   *  9-period signal EMA that has not settled yet — typically an entry within
   *  the first minutes of the session, where the line exists but the signal
   *  does not. */
  reason?: string
}

export default function UnclassifiedChip({
  count,
  reason = 'signal not settled',
}: UnclassifiedChipProps) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
      {count} excluded from this split ({reason})
    </span>
  )
}

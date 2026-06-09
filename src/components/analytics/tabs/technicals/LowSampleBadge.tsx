// Small neutral badge — shown when 0 < n < 5 inside any
// MACD bucket card per spec §C:104. Caveats the win rate
// without suppressing it (expectancy is the suppressed
// metric, handled separately in the BucketStats shape).
//
// Cloned from the TierBadge shell (h-[18px] px-1.5
// text-[10px] rounded-sm border font-semibold uppercase
// tracking-wider) with neutral tone — independent component
// so other Technicals surfaces (e.g. 5b's accordion table
// headers) can reuse it without depending on MacdBucketCard.

interface LowSampleBadgeProps {
  n: number
}

export default function LowSampleBadge({ n }: LowSampleBadgeProps) {
  if (n === 0 || n >= 5) return null
  return (
    <span
      title={`Low sample: n=${n}`}
      className="inline-flex shrink-0 items-center rounded-sm border h-[18px] px-1.5 text-[10px] font-semibold uppercase tracking-wider border-border-strong bg-bg-3 text-fg-tertiary"
    >
      Low sample
    </span>
  )
}

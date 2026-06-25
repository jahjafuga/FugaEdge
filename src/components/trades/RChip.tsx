// Per-trade R-Multiple chip — the single renderer for an R value across the app.
// Extracted from PlannedRiskEditor (beat A1) so the trade-detail header and the
// stop card can't drift on R formatting. Format: ±N.NNR; 4-tier tone (win >= 1 /
// gold >= 0 / red/80 >= -1 / red below); null -> a muted "— R" placeholder.
// Self-contained + relocatable, no imports beyond the JSX runtime.
export default function RChip({ r }: { r: number | null }) {
  if (r == null) {
    return (
      <span className="rounded bg-bg-3 px-2 py-0.5 font-mono text-[10px] text-fg-tertiary">
        — R
      </span>
    )
  }
  const tone =
    r >= 1
      ? 'border-win/40 bg-win/[0.10] text-win'
      : r >= 0
        ? 'border-gold/40 bg-gold/[0.08] text-gold'
        : r >= -1
          ? 'border-red/30 bg-red/[0.06] text-red/80'
          : 'border-red/50 bg-red/[0.12] text-red'
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${tone}`}
    >
      {r >= 0 ? '+' : ''}
      {r.toFixed(2)}R
    </span>
  )
}

import { useEffect, useState } from 'react'
import { money, signed, signedPct } from '@/lib/format'

interface PlannedRiskEditorProps {
  /** Pre-trade stop loss PRICE. */
  plannedStopLossPrice: number | null
  /** Average entry price ($/share). Used to derive risk-per-share live. */
  entryPrice: number
  /** Peak position size — used to project total $ risk. */
  shares: number
  /** Server-derived risk-per-share for the saved value. */
  riskPerShare: number | null
  /** Server-derived total $ risk. */
  totalRisk: number | null
  /** Realized net P&L for the trade — the R numerator. Display-only: shown in
   *  the explicit "P&L / risk = R" relationship line. Never used to compute R
   *  here; R arrives pre-computed via rMultiple. */
  netPnL: number
  /** Server-derived R-multiple (net P&L ÷ total risk). Null when no stop/risk
   *  is set. Rendered verbatim — never recomputed in the renderer. */
  rMultiple: number | null
  /** True when the trade is closed. The realized "= R" line only renders on a
   *  closed trade — an open trade's P&L isn't final. */
  isClosed: boolean
  onChange: (next: number | null) => void
}

// Inline editor for the pre-trade STOP LOSS PRICE. The trader enters the
// price (e.g. 10.20); we derive the per-share risk (|entry - stop|), total
// $ risk (risk × shares) live next to it. (R-multiple moved to the header.)
//
// Saves on blur (or Enter) — typing should not fire an IPC per keystroke.
export default function PlannedRiskEditor({
  plannedStopLossPrice,
  entryPrice,
  shares,
  riskPerShare,
  totalRisk,
  netPnL,
  rMultiple,
  isClosed,
  onChange,
}: PlannedRiskEditorProps) {
  const [text, setText] = useState<string>(
    plannedStopLossPrice == null ? '' : String(plannedStopLossPrice),
  )

  useEffect(() => {
    const display = plannedStopLossPrice == null ? '' : String(plannedStopLossPrice)
    setText((cur) => (cur === display ? cur : display))
  }, [plannedStopLossPrice])

  const commit = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      if (plannedStopLossPrice != null) onChange(null)
      return
    }
    const n = Number.parseFloat(trimmed)
    if (!Number.isFinite(n) || n <= 0) {
      setText(plannedStopLossPrice == null ? '' : String(plannedStopLossPrice))
      return
    }
    if (n !== plannedStopLossPrice) onChange(n)
  }

  // Live preview while typing — recalc against the typed value if it parses
  // cleanly so the user sees their derived risk before they commit.
  const typedStop = Number.parseFloat(text)
  const hasTypedStop = Number.isFinite(typedStop) && typedStop > 0
  const previewRiskPerShare =
    hasTypedStop && entryPrice > 0 ? Math.abs(entryPrice - typedStop) : null
  const previewTotalRisk =
    previewRiskPerShare != null && shares > 0 ? previewRiskPerShare * shares : null

  const displayRiskPerShare = previewRiskPerShare ?? riskPerShare
  const displayTotalRisk = previewTotalRisk ?? totalRisk

  // Stop distance % — the new display metric. Uses the SAME typed-or-saved stop
  // the risk preview uses (typed while editing, else the saved prop), signed by
  // direction: a stop BELOW entry (long) reads negative, ABOVE (short) positive.
  // Display-only inline arithmetic — no new prop, no helper, no P&L / R.
  const effectiveStop = hasTypedStop ? typedStop : plannedStopLossPrice
  const hasStop = effectiveStop != null && effectiveStop > 0
  const displayStopDistancePct =
    effectiveStop != null && effectiveStop > 0 && entryPrice > 0
      ? ((effectiveStop - entryPrice) / entryPrice) * 100
      : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 py-2 focus-within:border-gold">
        <span className="font-mono text-sm text-fg-tertiary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.currentTarget as HTMLInputElement).blur()
            }
          }}
          placeholder="stop price"
          className="w-full bg-transparent font-mono text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
        />
      </div>

      {hasStop && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tnum text-fg-secondary">
          <span>{displayRiskPerShare == null ? '—' : `${money(displayRiskPerShare)}/sh`}</span>
          <span className="text-fg-tertiary">·</span>
          <span>{displayTotalRisk == null ? '—' : `${money(displayTotalRisk)} total`}</span>
          <span className="text-fg-tertiary">·</span>
          <span>{displayStopDistancePct == null ? '—' : signedPct(displayStopDistancePct)}</span>
        </div>
      )}

      {/* Explicit R relationship — makes the ratio legible so a user changing
          the stop sees exactly what R is a ratio of: realized P&L over planned
          risk. Display-only; uses the SAVED total risk + r_multiple (the same
          computeRiskBreakdown values shown elsewhere), never recomputed here.
          Only on a closed, stopped trade; R is a neutral ratio, not P&L-toned. */}
      {isClosed && rMultiple != null && totalRisk != null && (
        <div className="font-mono text-[11px] tnum text-fg-secondary">
          {signed(netPnL)} P&amp;L / {money(totalRisk)} risk ={' '}
          {rMultiple >= 0 ? '+' : ''}
          {rMultiple.toFixed(2)}R
        </div>
      )}
    </div>
  )
}

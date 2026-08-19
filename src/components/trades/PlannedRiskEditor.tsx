import { useEffect, useState } from 'react'
import { money, price, signed, signedPct } from '@/lib/format'

interface PlannedRiskEditorProps {
  /** Pre-trade stop loss PRICE. */
  plannedStopLossPrice: number | null
  /** WHO set that price: 'manual' = the user typed it, 'auto' = the app derived it
   *  from the first entry, null = there is no stop. A derived stop and a typed one
   *  produce identical R numbers, so this label is the only thing on screen that can
   *  tell them apart — without it the app presents its own guess as the user's plan. */
  stopSource: 'manual' | 'auto' | null
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
  stopSource,
  entryPrice,
  shares,
  riskPerShare,
  totalRisk,
  netPnL,
  rMultiple,
  isClosed,
  onChange,
}: PlannedRiskEditorProps) {
  // Shown at the house price precision, not raw. A derived stop is STORED
  // unrounded on purpose -- every R this trade reports divides by it -- and six of
  // the eleven stops the auto-fill wrote on the live book carry a full binary
  // expansion, so the field was printing 9.593300000000001 for a nine-fifty-nine
  // stock. price() is the one rule every quoted price in the app goes through.
  const display = (v: number | null) => (v == null ? '' : price(v))
  const [text, setText] = useState<string>(() => display(plannedStopLossPrice))

  useEffect(() => {
    const next = display(plannedStopLossPrice)
    setText((cur) => (cur === next ? cur : next))
    // `display` is recreated each render and is a pure function of the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedStopLossPrice])

  const commit = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      if (plannedStopLossPrice != null) onChange(null)
      return
    }
    // price() groups thousands, so the text it produces is not always parseable
    // as-is. Stripping separators keeps ONE precision rule rather than a second,
    // grouping-free copy of it living here.
    const n = Number.parseFloat(trimmed.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setText(display(plannedStopLossPrice))
      return
    }
    // THE COMPARISON IS ON THE DISPLAYED FORM, not the stored number. They differ
    // by design now, so comparing the numbers would read every blur as an edit --
    // clicking through the card would write the rounded value back and, because
    // any save latches provenance, silently turn a derived stop into a typed one.
    if (display(n) === display(plannedStopLossPrice)) return
    onChange(n)
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

      {hasStop && stopSource !== null && (
        <div
          data-testid="stop-source"
          className={
            stopSource === 'auto'
              ? 'inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-tertiary'
              : 'inline-flex items-center gap-1 rounded border border-gold/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold'
          }
          title={
            stopSource === 'auto'
              ? 'Derived from the first entry and your auto-fill percentage. Type over it to make it yours.'
              : 'You typed this stop. Nothing automatic will overwrite or clear it.'
          }
        >
          {stopSource === 'auto' ? 'Derived' : 'You set this'}
        </div>
      )}

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

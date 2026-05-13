import { useEffect, useState } from 'react'
import { money } from '@/lib/format'

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
  rMultiple: number | null
  onChange: (next: number | null) => void
}

// Inline editor for the pre-trade STOP LOSS PRICE. The trader enters the
// price (e.g. 10.20); we derive the per-share risk (|entry - stop|), total
// $ risk (risk × shares), and R-multiple live next to it.
//
// Saves on blur (or Enter) — typing should not fire an IPC per keystroke.
export default function PlannedRiskEditor({
  plannedStopLossPrice,
  entryPrice,
  shares,
  riskPerShare,
  totalRisk,
  rMultiple,
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 rounded border border-border-strong bg-bg-1 px-2.5 py-1 focus-within:border-gold">
        <span className="font-mono text-xs text-fg-tertiary">$</span>
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
          className="w-24 bg-transparent font-mono text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
        />
      </div>

      {displayRiskPerShare != null && (
        <span className="font-mono text-[11px] text-fg-tertiary">
          {money(displayRiskPerShare)}/sh
        </span>
      )}
      {displayTotalRisk != null && (
        <span className="font-mono text-[11px] text-fg-tertiary">
          · {money(displayTotalRisk)} total
        </span>
      )}

      <RChip r={rMultiple} />
    </div>
  )
}

function RChip({ r }: { r: number | null }) {
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

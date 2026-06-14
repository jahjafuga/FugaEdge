import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { UseEdgeScoreResult } from '@/lib/useEdgeScore'
import { EDGE_SCORE_BANDS, type AxisResult } from '@/core/score/edgeScore'
import { fmtRaw } from './edgeScoreFormat'

// v0.2.5 Edge Intelligence — Beat 2. The COMPACT Edge Score card (left of the
// RadarCard in the /intelligence 2-col row). The 0–100 composite numeral + the
// honesty chips (n / Provisional · last 90 days) + a COLLAPSED "Weights & bands"
// disclosure (D10 — the published formula stays available in-app, one click,
// labeled). NO sparkline / NO vs-30d delta: the score is a single composite with
// no honest series yet — that lands with the deferred trend/delta beat; a faked
// trend would break the same no-fabrication law as Focus Area dollars. The card
// is COMPLETE as-is (no reserved empty slot). card-premium + a card-glow-gold
// first-class treatment matching the hero band (B2 tuning); reads the lifted
// useEdgeScore result and owns its own loading / suppressed / error.
export default function ScoreCard({ result, loading, error }: UseEdgeScoreResult) {
  const [showFormula, setShowFormula] = useState(false)

  if (error) {
    if (typeof console !== 'undefined') console.error('[edge-score]', error)
    return null // never blow up the page for a score failure
  }

  return (
    <section aria-label="Edge Score" className="card-premium card-glow-gold flex flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Edge Score
        </h2>
        {result && !result.suppressed && !loading && (
          <div className="flex items-center gap-2">
            {result.provisional && (
              <span className="rounded-md border border-gold/40 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                Provisional
              </span>
            )}
            <span className="font-mono text-[10px] text-fg-muted tnum">
              n = {result.n} · last 90 days
            </span>
          </div>
        )}
      </div>

      {loading || !result ? (
        <div className="skeleton mt-4 h-[120px]" />
      ) : result.suppressed ? (
        <div className="mt-4 rounded-md border border-dashed border-border-subtle bg-bg-1 p-6 text-center text-sm text-fg-secondary">
          Not enough trades to score yet — the Edge Score needs at least 5 in the
          last 90 days (you have {result.n}).
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-7xl font-semibold tabular-nums text-gold">
              {result.score}
            </span>
            <span className="font-mono text-xl text-fg-muted">/100</span>
          </div>
          <div className="mt-1.5 text-xs text-fg-tertiary">
            How sharp you are right now — process-weighted.
          </div>

          {/* Weights & bands — collapsed by default (D10, the published-formula
              rule: kept available in-app, one click, never dropped or buried).
              Inside the centered group so it sits snug under the score — no dead
              gap above it (B2 tuning). */}
          <div className="mt-5 border-t border-border-subtle/60 pt-3">
            <button
              type="button"
              onClick={() => setShowFormula((v) => !v)}
              aria-expanded={showFormula}
              className="flex w-full items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-fg-secondary"
            >
              Weights &amp; bands
              {showFormula ? (
                <ChevronUp size={12} strokeWidth={2.25} />
              ) : (
                <ChevronDown size={12} strokeWidth={2.25} />
              )}
            </button>
            {showFormula && (
              <div className="mt-3 grid grid-cols-1 gap-y-1.5">
                {result.axes.map((a) => (
                  <AxisRow key={a.key} axis={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function AxisRow({ axis }: { axis: AxisResult }) {
  const band = EDGE_SCORE_BANDS.find((b) => b.key === axis.key)!
  const cov = axis.coverage
  const showCov = axis.key === 'discipline' && cov && cov.total > 0
  const covPct = showCov ? Math.round((cov!.complete / cov!.total) * 100) : 0
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-medium text-fg-primary">{axis.label}</span>
        <span className="font-mono text-[10px] text-fg-muted tnum">{axis.weight}%</span>
        {showCov && (
          <span
            className="shrink-0 rounded border border-border-subtle bg-bg-1 px-1.5 py-0.5 font-mono text-[10px] text-fg-tertiary tnum"
            title="Trades with complete indicator data — the rest are excluded from the discipline read."
          >
            based on {cov!.complete} of {cov!.total} trades ({covPct}%)
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="font-mono text-[10px] text-fg-muted">{band.band}</span>
        <span className="w-12 text-right font-mono text-fg-secondary tnum">
          {fmtRaw(axis.raw, band.rawFormat)}
        </span>
      </div>
    </div>
  )
}

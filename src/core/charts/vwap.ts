// Pure per ARCHITECTURE rule 1: no electron / fs / db imports
import type { IntradayBar } from '@shared/market-types'
import { utcToEasternParts } from '@/lib/format'

/**
 * Session VWAP — typical price `hlc3 = (H + L + C) / 3`,
 * cumulative `Σ(hlc3 × volume) / Σ(volume)` from the
 * regular-session open (09:30 ET), reset daily.
 *
 * INPUT CONTRACT: `bars` must be the ACTIVE DAY only
 * (no warmup bars). Warmup-union input would anchor VWAP
 * days ago and be completely wrong. The caller's job is
 * to filter to active-day bars before calling.
 *
 * Returns one VWAP value per active-day bar at-or-after
 * 09:30 ET. Pre-9:30 bars (extended-hours pre-market)
 * produce a null VWAP value (the anchor hasn't started
 * accumulating yet). Result array length equals input
 * length.
 *
 * > Single-active-day input only. The function does NOT
 * > reset accumulators across day boundaries — passing
 * > multi-day input would produce a cumulative running
 * > value across the union. v0.2.4 callers (Session 2's
 * > computeTradeTechnicals and a future chart-overlay
 * > refactor) always pass a single active day. Multi-day
 * > support is deferred.
 *
 * Pure module (no Electron / DB imports) — reused by the
 * trade chart's VWAP overlay (future refactor) and
 * Session 2's computeTradeTechnicals.
 */
export function vwap(bars: IntradayBar[]): { time: number; value: number | null }[] {
  const out: { time: number; value: number | null }[] = []
  let cumPV = 0
  let cumV = 0
  for (const b of bars) {
    if (atOrAfterRegularOpen(b.t)) {
      const hlc3 = (b.h + b.l + b.c) / 3
      cumPV += hlc3 * b.v
      cumV += b.v
      // cumV === 0 only when every accumulated bar so far had zero volume —
      // fall back to this bar's typical price rather than emit NaN.
      out.push({ time: b.t, value: cumV > 0 ? cumPV / cumV : hlc3 })
    } else {
      // Pre-9:30 ET (extended-hours pre-market) or an unparseable timestamp:
      // the session anchor hasn't started accumulating yet.
      out.push({ time: b.t, value: null })
    }
  }
  return out
}

// True when the bar's epoch-ms start falls at or after 09:30 America/New_York
// (DST-aware via utcToEasternParts). Returns false for pre-open bars and for a
// non-finite / unparseable timestamp (treated as "not yet anchored").
function atOrAfterRegularOpen(epochMs: number): boolean {
  if (!Number.isFinite(epochMs)) return false
  const p = utcToEasternParts(new Date(epochMs).toISOString())
  if (!p) return false
  return p.hour > 9 || (p.hour === 9 && p.minute >= 30)
}

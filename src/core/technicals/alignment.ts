// v0.2.5 — the disciplined-entry / full-alignment predicate. SINGLE SOURCE OF
// TRUTH for the §A6/D7 alignment read: the XP path (awards.isDisciplinedEntry),
// the Edge Score discipline axis + Technicals header cards
// (headerStrip.fullAlignment), and the Technicals tab aligned/misaligned band
// (combinedReads.classifyAlignment) all route through here. Before this, the
// triple was inline-copied in three places (drift risk); now it is encoded once.
//
// Pure (ARCHITECTURE #1) — no electron / fs / DB / React. Reused by both the
// analytics layer and the XP layer.
//
// THE PRE-MARKET AMENDMENT (2026-06): session VWAP is anchored at the 09:30 ET
// regular-session open (see vwap.ts) and does not exist before it. So for an
// entry placed PRE-MARKET (before 09:30 ET), "above VWAP" is not a discipline
// signal — it is undefined — and the predicate drops it, judging alignment on
// MACD-positive AND above-the-9EMA only. A regular-hours entry keeps the full
// triple. (A pre-market momentum entry above the 9EMA with positive MACD is
// disciplined; the absent session VWAP is N/A, not a failure.)

import { utcToEasternParts } from '@/lib/format'

/**
 * Full alignment at entry. Strict, null-safe:
 *   - regular hours: macd_positive AND vwap_dist_pct > 0 AND ema9_dist_pct > 0
 *   - pre-market   : macd_positive AND ema9_dist_pct > 0  (VWAP is N/A → dropped)
 * A null distance reads as "not above"; a null/false macd_positive as "not
 * positive". `isPreMarket` is supplied by the caller (the analytics rows derive
 * it from open_time via isPreMarketEntry; the XP TradeFact carries it).
 */
export function isFullyAligned(
  macdPositive: boolean | null,
  vwapDistPct: number | null,
  ema9DistPct: number | null,
  isPreMarket: boolean,
): boolean {
  const macd = macdPositive === true
  const aboveEma9 = ema9DistPct !== null && ema9DistPct > 0
  if (isPreMarket) {
    // Session VWAP doesn't exist yet — judge on MACD + 9EMA only.
    return macd && aboveEma9
  }
  const aboveVwap = vwapDistPct !== null && vwapDistPct > 0
  return macd && aboveVwap && aboveEma9
}

/**
 * True when the entry timestamp falls before 09:30 America/New_York (session
 * VWAP not yet anchored). DST-aware via utcToEasternParts. An unparseable
 * timestamp returns false (treated as regular hours → the stricter, full-triple
 * branch → under-credit, matching the codebase's null-fails-safe convention).
 */
export function isPreMarketEntry(openTimeUtc: string): boolean {
  const p = utcToEasternParts(openTimeUtc)
  if (!p) return false
  return p.hour < 9 || (p.hour === 9 && p.minute < 30)
}

// Pure per ARCHITECTURE rule 1: no electron / fs / db imports

/**
 * SMA-seeded EMA. The first `period - 1` outputs are null;
 * index `period - 1` is seeded with the SMA of the first
 * `period` values, then the recurrence
 * `ema_today = (price_today * K) + (ema_yesterday * (1 - K))`
 * runs from index `period` onward, with K = 2 / (period + 1).
 *
 * Why SMA seed (and not first-value / adjust=false): matches
 * the codebase's existing EMA helpers (electron/lib/ema.ts,
 * macd.ts's prior internal ema, ChartTab.tsx's inline ema
 * for EMA9/EMA20 overlays) so MACD sub-pane and the
 * EMA9/EMA20 overlays produce identical values. TradingView-
 * parity first-value seeding is the v0.3.0 cross-helper
 * unification beat — see docs/plans/v0.3.0-or-later-ideas.md
 * "TradingView-parity EMA seed unification."
 *
 * Pure module (no Electron / DB imports) — reused by macd.ts
 * and Session 2's computeTradeTechnicals.
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

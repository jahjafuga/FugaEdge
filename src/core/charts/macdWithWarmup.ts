// Pure per ARCHITECTURE rule 1: no electron / fs / db imports
import type { IntradayBar } from '@shared/market-types'
import { aggregate } from './aggregate'
import { computeMacd, type MacdResult } from './macd'

/**
 * Compute MACD over a warmup-prefixed bar series and return only the
 * active-day output points.
 *
 * Inputs:
 *   - warmupBars: prior-trading-day bars (may be empty for legacy cache
 *     rows; the function falls back to computing on activeBars alone)
 *   - activeBars: active-session bars
 *   - aggregationMinutes: 1 for 1-minute MACD, 5 for 5-minute MACD
 *     (pass-through when <= 1)
 *
 * Pipeline: union -> aggregate -> compute -> filter to active-day
 * timestamps. The active-day filter prevents off-grid warmup timestamps
 * from corrupting the lightweight-charts shared timeScale (see
 * ChartTab.tsx mount-time pane creation history).
 *
 * Warmup precedes active by construction (warmup = date-4..date-1,
 * active = date); a dev-time invariant throws if the ordering is
 * violated.
 *
 * Pure module (no Electron / DB imports) — reused by the trade chart and
 * Session 2's computeTradeTechnicals.
 */
export function computeMacdWithWarmup(
  warmupBars: IntradayBar[],
  activeBars: IntradayBar[],
  aggregationMinutes: number,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  // Union step — warmup precedes active by construction (recon STEP 7), so
  // the concatenation is globally ascending by t. The dev-time invariant
  // guards that ordering contract.
  const unionBars = [...warmupBars, ...activeBars]
  if (warmupBars.length > 0 && activeBars.length > 0) {
    const lastWarmup = warmupBars[warmupBars.length - 1].t
    const firstActive = activeBars[0].t
    if (lastWarmup >= firstActive) {
      throw new Error(
        `computeMacdWithWarmup: warmup must precede active ` +
        `(lastWarmup=${lastWarmup} >= firstActive=${firstActive})`
      )
    }
  }

  // Aggregation step — on the UNION so a bucket straddling the
  // warmup-to-active boundary would be correct; in practice the overnight
  // gap means none does. Pass-through when aggregationMinutes <= 1.
  const aggBars = aggregate(unionBars, aggregationMinutes)

  // MACD compute over the aggregated union.
  const result = computeMacd(aggBars, fastPeriod, slowPeriod, signalPeriod)

  // Active-day filter — drop warmup-timestamped output so off-grid
  // timestamps never reach the shared timeScale. Graceful degrade when
  // there are no active bars (an error-path payload can carry warmup with
  // empty active).
  if (activeBars.length === 0) {
    return { macd: [], signal: [], histogram: [] }
  }
  const cutoff = activeBars[0].t
  return {
    macd: result.macd.filter((p) => p.time >= cutoff),
    signal: result.signal.filter((p) => p.time >= cutoff),
    histogram: result.histogram.filter((p) => p.time >= cutoff),
  }
}

// Pure per ARCHITECTURE rule 1: no electron / fs / db imports
import type { IntradayBar } from '@shared/market-types'

/**
 * Buckets ascending 1-minute bars onto an absolute minutes-wide time
 * grid. Per bucket: O = first bar's open, C = last bar's close, H = max
 * high, L = min low, V = summed volume. Bars whose minutes <= 1 (or empty
 * input) pass through unchanged.
 *
 * Pure module (no Electron / DB imports) — reused by the trade chart's
 * bars useMemo and computeMacdWithWarmup.
 */
export function aggregate(bars: IntradayBar[], minutes: number): IntradayBar[] {
  if (bars.length === 0 || minutes <= 1) return bars
  const bucketMs = minutes * 60 * 1000
  const out: IntradayBar[] = []
  let bucketStart = 0
  let cur: IntradayBar | null = null
  for (const b of bars) {
    const start = Math.floor(b.t / bucketMs) * bucketMs
    if (!cur || start !== bucketStart) {
      if (cur) out.push(cur)
      bucketStart = start
      cur = { t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    }
  }
  if (cur) out.push(cur)
  return out
}

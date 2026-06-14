// v0.2.5 Edge Intelligence Beat 3 — the three prescriptive hero cards
// (Biggest Edge / Biggest Leak / Focus Area). PURE SELECTOR over the existing
// runAllInsightRules output (§F: "a pure selector ... no new detection
// engine"). No electron/DB/React imports (ARCHITECTURE #1); never src/core/xp.
//
//   - Biggest Edge = the top-priority POSITIVE-tone insight that clears the
//     low-sample floor (n >= minHeroN). A hero card is a claim about a DURABLE
//     pattern, so a tiny-sample fluke must never be featured (the full feed
//     below still shows small-n insights with their counts).
//   - Biggest Leak = the same, NEGATIVE-tone.
//   - Focus Area = the fix DERIVED FROM the same insight chosen as the leak —
//     the leak names the problem, Focus names the fix (its trailing directive
//     sentence). The realized dollar is shown ONLY when the leak's metric is a
//     genuine money figure ($); rate/ratio leaks keep their native framing (no
//     manufactured/derived dollars — that dishonesty is exactly what we avoid).

import type { InsightResult } from './types'

export interface FocusArea {
  /** The insight chosen as Biggest Leak — the problem Focus prescribes a fix for. */
  leakInsight: InsightResult | null
  /** The fix: the leak body's trailing directive sentence ('' when no leak). */
  action: string
  /** The leak's realized loss, ONLY when its metric is a money figure; else null
   *  (rate/ratio leaks surface their native metric instead). */
  dollar: string | null
}

export interface HeroCards {
  edge: InsightResult | null
  leak: InsightResult | null
  focus: FocusArea
}

export interface SelectHeroOptions {
  /** Minimum sample size for an insight to be featured as a hero. Default 10. */
  minHeroN?: number
}

/** Absolute numeric magnitude of a metric string ("+$1,240" → 1240, "2.5×" →
 *  2.5, "62%" → 62) — a tiebreak proxy only (never displayed). */
function metricMagnitude(metric: string | undefined): number {
  if (!metric) return 0
  const v = parseFloat(metric.replace(/[^0-9.]/g, ''))
  return Number.isFinite(v) ? Math.abs(v) : 0
}

/** The fix is the leak body's trailing sentence (the rules end each leak with an
 *  imperative directive). Falls back to the whole body if no terminator. */
export function deriveAction(body: string): string {
  const sentences = body.trim().match(/[^.!?]+[.!?]+/g)
  if (!sentences || sentences.length === 0) return body.trim()
  return sentences[sentences.length - 1].trim()
}

/** fmtMoney/fmtMoneyAbs produce a "$"; rate/ratio metrics (%, ×, R) never do. */
function isMoneyMetric(metric: string | undefined): boolean {
  return metric !== undefined && metric.includes('$')
}

export function selectHeroCards(
  insights: InsightResult[],
  opts: SelectHeroOptions = {},
): HeroCards {
  const minHeroN = opts.minHeroN ?? 10

  const pick = (tone: InsightResult['tone']): InsightResult | null => {
    const qualifying = insights
      .filter((i) => i.tone === tone && i.n >= minHeroN)
      .sort(
        (a, b) =>
          b.priority - a.priority || // "biggest" = highest priority
          b.n - a.n || // tie → the more-sampled (more durable) wins
          metricMagnitude(b.metric) - metricMagnitude(a.metric),
      )
    return qualifying[0] ?? null
  }

  const edge = pick('positive')
  const leak = pick('negative')
  const focus: FocusArea = {
    leakInsight: leak,
    action: leak ? deriveAction(leak.body) : '',
    dollar: leak && isMoneyMetric(leak.metric) ? leak.metric! : null,
  }

  return { edge, leak, focus }
}

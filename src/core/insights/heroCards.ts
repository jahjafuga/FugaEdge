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

/** Split a body into sentences. A terminator (. ! ?) ends a sentence ONLY when
 *  it's followed by whitespace or end-of-string — so a decimal point inside a
 *  number ($1.5M, +0.16R, 47.5%, 1.3×) is NEVER a boundary. Shared by
 *  deriveAction + deriveFinding so the two can't drift, and both get the decimal
 *  fix in one place (the old `[.!?]+` split broke "+0.16R" into "+0." | "16R…"). */
export function splitSentences(body: string): string[] {
  return body
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** The fix/directive — the body's trailing sentence (the rules end each insight
 *  with an imperative directive). Falls back to the whole body if no terminator. */
export function deriveAction(body: string): string {
  const sentences = splitSentences(body)
  if (sentences.length === 0) return body.trim()
  return sentences[sentences.length - 1]
}

/** The FINDING — the body's FIRST sentence (the names + numbers), the companion
 *  to deriveAction's trailing directive. Returns '' when the body is a single
 *  sentence (then finding == directive; the caller shows the directive alone,
 *  not duplicated). Used by the Trading Coach to surface the specifics rather
 *  than only the generic tail. */
export function deriveFinding(body: string): string {
  const sentences = splitSentences(body)
  if (sentences.length <= 1) return ''
  return sentences[0]
}

/** fmtMoney/fmtMoneyAbs produce a "$"; rate/ratio metrics (%, ×, R) never do. */
function isMoneyMetric(metric: string | undefined): boolean {
  return metric !== undefined && metric.includes('$')
}

/** Signed value of a MONEY metric ("+$1,280" → 1280, "−$47" → -47), or null when
 *  the metric isn't a money figure (%/×/R keep their native framing). Recognizes
 *  fmtMoney's Unicode minus (−), an ASCII '-', and accounting parens. */
function moneyMetricValue(metric: string | undefined): number | null {
  if (!isMoneyMetric(metric)) return null
  const negative = /[-−(]/.test(metric!)
  const v = parseFloat(metric!.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(v)) return null
  return negative ? -v : v
}

export function selectHeroCards(
  insights: InsightResult[],
  opts: SelectHeroOptions = {},
): HeroCards {
  const minHeroN = opts.minHeroN ?? 10

  const pick = (tone: InsightResult['tone']): InsightResult | null => {
    const qualifying = insights
      .filter((i) => {
        if (i.tone !== tone || i.n < minHeroN) return false
        // Defense-in-depth (v0.2.5 leak-slot inversion fix): a 'negative'-toned
        // insight whose money metric is actually POSITIVE is mislabeled and must
        // never win the leak slot (or feed Focus). Non-money (%/×/R) leaks keep
        // their native framing — the guard applies only to dollar metrics.
        if (tone === 'negative') {
          const v = moneyMetricValue(i.metric)
          if (v !== null && v > 0) return false
        }
        return true
      })
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

// v0.2.7 — EDGE ANSWERS: the number, and everything a trader needs to check it.
//
// SLICE B, ruled by the founder after beat 156 measured the gap: AGGREGATE-OVER-
// FILTER and RATIO, nine of fifteen demand sentences. Comparison, grouped
// superlative, count-of-groups, superlative and cost-of-tag stay refusing and are
// pinned as chosen, not missed.
//
// THE ANSWER RIDES ON TOP OF A NORMAL FILTER. The resolver applies the filter
// exactly as it does today, the table below shows the rows, and the number is
// computed HERE from those same rows. There is no second query and no second
// definition of a winner: `computeOutcomeStats` is the shipped one, and it reads
// nothing but `net_pnl`, so it takes the filtered rows unchanged.
//
// R244 — NO NUMBER WITHOUT ITS DENOMINATOR. Every sentence this file produces
// carries the count it was computed over, and every ratio names its numerator and
// denominator in words. A rate over four trades is honest ONLY because the four
// is in the sentence.
//
// R244 — AND NO NUMBER AT ALL WHEN THERE IS NOTHING TO COUNT. Two distinct empty
// cases, and neither may print a digit:
//   NO ROWS MATCH        — "no trades match" and nothing else.
//   ROWS MATCH, METRIC UNDEFINED — "average loss over winners" has rows but no
//                          losers in them. Saying zero would invent a loss that
//                          did not happen; saying nothing would hide the ask.
//                          It says which of the two it is.
//
// R243 — DESCRIPTIVE, NEVER COUNTERFACTUAL. Every wording here states what the
// rows ARE. Nothing in this file words a sum as a cost, a saving, or a
// what-if — "chasing cost you X" is a claim about a world that did not happen,
// and there is deliberately no metric it could attach to.

import { computeOutcomeStats } from '@/core/stats/outcomeStats'

/** The metrics slice B answers. Each is either a plain aggregate over the
 *  filtered rows or a ratio of two of them — nothing here groups, compares, or
 *  ranks, because none of those shapes shipped. */
export type AnswerMetric =
  | 'count'
  | 'net_pnl'
  | 'avg_winner'
  | 'avg_loser'
  | 'win_rate'
  | 'profit_factor'
  | 'avg_hold'

/** What the resolver read. `source` is the trader's own words, so the response
 *  can echo the ask rather than a label the trader never typed. */
export interface AnswerIntent {
  metric: AnswerMetric
  source: string
}

/** The only row shape this file needs: net_pnl for every metric, and the two
 *  timestamps for the hold. Deliberately structural — the filtered rows satisfy
 *  it without a cast, and so does a test fixture of six literals. */
export interface RowForAnswer {
  net_pnl: number
  open_time?: string
  close_time?: string | null
}

const money = (n: number): string => {
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (n < 0 ? '-$' : '$') + s
}

const pct = (r: number): string => (r * 100).toFixed(1) + '%'

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? '1 ' + one : n.toLocaleString('en-US') + ' ' + many

/** Minutes and seconds, because a momentum hold is rarely hours and never days.
 *  Seconds are floored, not rounded, so the printed duration never exceeds the
 *  measured one. */
export function holdText(seconds: number): string {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return m > 0 ? m + 'm ' + (s % 60) + 's' : s + 's'
}

/** Mean seconds between open and close, over the rows that HAVE both. Returns
 *  null when none do — an open position has no hold yet, and averaging it in as
 *  zero would drag the answer toward a number no trade produced.
 *
 *  This is the one metric with no reusable site at this row shape:
 *  computeFullStats owns the same arithmetic but demands eight more columns
 *  (mae, mfe, gross_pnl, total_fees among them) that the filtered row does not
 *  carry, so calling it would mean inventing values to satisfy a type. */
export function meanHoldSeconds(
  rows: readonly RowForAnswer[],
): { mean: number; over: number } | null {
  let sum = 0
  let n = 0
  for (const r of rows) {
    if (!r.open_time || !r.close_time) continue
    const o = new Date(r.open_time).getTime()
    const c = new Date(r.close_time).getTime()
    if (!Number.isFinite(o) || !Number.isFinite(c)) continue
    sum += Math.max(0, (c - o) / 1000)
    n += 1
  }
  // R244, AND THE DENOMINATOR HAS TO BE THE REAL ONE. This returns the count it
  // actually averaged over, not the count of rows it was handed. They differ the
  // moment a position is still open, and reporting the larger number would put a
  // denominator in the sentence that the mean was never divided by -- a lie in
  // exactly the shape R244 exists to forbid, and one no zero-row tell would catch.
  return n > 0 ? { mean: sum / n, over: n } : null
}

/** The sentence a trader reads. `null` intent means this ask was not an answer
 *  ask, and the caller shows the ordinary filter response instead. */
export function answerText(
  intent: AnswerIntent | null | undefined,
  rows: readonly RowForAnswer[],
): string | null {
  if (!intent) return null

  const n = rows.length
  // R244, first empty case. No rows, no number, and say which ask went
  // unanswered so the trader knows the question was understood.
  if (n === 0) return 'No trades match, so there is no ' + LABEL[intent.metric] + ' to report.'

  const s = computeOutcomeStats(rows)
  const over = ', over ' + plural(n, 'trade', 'trades') + '.'

  switch (intent.metric) {
    case 'count':
      // The count IS the answer; its own denominator is itself.
      return plural(n, 'trade matches', 'trades match') + '.'

    case 'net_pnl':
      return 'Total P&L: ' + money(s.net_pnl) + over

    case 'avg_winner':
      return s.avg_winner === null
        ? undefinedOver(n, 'winning trade', LABEL.avg_winner)
        : 'Average gain: ' + money(s.avg_winner) + ', over '
          + plural(s.winners, 'winning trade', 'winning trades') + '.'

    case 'avg_loser':
      return s.avg_loser === null
        ? undefinedOver(n, 'losing trade', LABEL.avg_loser)
        : 'Average loss: ' + money(s.avg_loser) + ', over '
          + plural(s.losers, 'losing trade', 'losing trades') + '.'

    case 'win_rate': {
      // R244 in full: the ratio is meaningless without both halves, and a rate
      // over four decided trades is honest only because the four is here.
      const decided = s.winners + s.losers
      // R202 -- REVERSED BY THIS BEAT, MEASURED BY BEAT TWO HUNDRED AND SIX.
      // WAS: a headline value joined to its working by an em dash,
      //   'Win rate: ' + pct(...) + ' EMDASH '
      // A colon was already separating the label from the value, so the dash
      // was doing a second and different job in one short sentence. It is a
      // FULL STOP now, which lets the number land on its own. Every composed
      // form was driven on three books first and none produces a double stop
      // or a double space.
      return decided === 0
        ? undefinedOver(n, 'decided trade', LABEL.win_rate)
        : 'Win rate: ' + pct(s.win_rate as number) + '. '
          + plural(s.winners, 'winner', 'winners') + ' of '
          + plural(decided, 'decided trade', 'decided trades') + '.'
    }

    case 'profit_factor': {
      // The two sums are DERIVED from the averages the shipped stats already
      // returned, never recounted here. A second `net_pnl > 0` in this file
      // would be a second definition of a winner, drifting from
      // SCRATCH_EPSILON the moment either side moves.
      const wonSum = (s.avg_winner ?? 0) * s.winners
      const lostSum = (s.avg_loser ?? 0) * s.losers
      return s.profit_factor === null
        ? undefinedOver(n, 'losing trade', LABEL.profit_factor)
        // R202 -- SAME RULING AS THE WIN RATE ABOVE. The value carries a
        // decimal point of its own, so the stop lands just after one. That is a
        // number-dot then a sentence-dot, not a double stop, and it is the only
        // place this ruling puts two dots near each other.
        : 'Profit factor: ' + s.profit_factor.toFixed(2) + '. '
          + money(wonSum) + ' won against ' + money(Math.abs(lostSum)) + ' lost' + over
    }

    case 'avg_hold': {
      const h = meanHoldSeconds(rows)
      return h === null
        ? undefinedOver(n, 'closed trade', LABEL.avg_hold)
        : 'Average hold: ' + holdText(h.mean) + ', over '
          + plural(h.over, 'closed trade', 'closed trades') + '.'
    }
  }
}

/** R244, second empty case: rows matched but the metric has no value in them.
 *  Names the count AND what is missing, so the sentence cannot be read as zero.
 *
 *  R202 -- REVERSED BY THIS BEAT, MEASURED BY BEAT TWO HUNDRED AND SIX.
 *  WAS: ' EMDASH no ' joining the clause to its consequence. A COLON now,
 *  because a comma is already in play earlier in the same sentence and a
 *  second one would make it a splice. The colon introduces the consequence,
 *  which is the job the dash was doing. */
function undefinedOver(n: number, missing: string, label: string): string {
  return plural(n, 'trade matches', 'trades match')
    + ', but none of them is a ' + missing + ': no ' + label + ' to report.'
}

/** Named so the two empty cases and the metric map cannot drift apart. */
export const LABEL: Record<AnswerMetric, string> = {
  count: 'count',
  net_pnl: 'total',
  avg_winner: 'average gain',
  avg_loser: 'average loss',
  win_rate: 'win rate',
  profit_factor: 'profit factor',
  avg_hold: 'average hold',
}

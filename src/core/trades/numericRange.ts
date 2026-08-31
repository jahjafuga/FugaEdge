// v0.2.7 Feature 4 — THE numeric range filter. One implementation, every column.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React imports.
//
// There was no range idiom in the codebase before this — the trades filter handled
// symbol, side, duration buckets, dates, outcome and the three multi-selects, none of
// which is a min/max over a number. Fifteen new numeric columns each wanting one is
// exactly how a codebase ends up with fifteen slightly different comparisons, so this
// is deliberately the only one, and a source guard keeps it that way.
//
// THE NULL RULE, stated once here so no caller re-decides it:
//   A null value is EXCLUDED by any active range, and INCLUDED when no range is set.
// A null is not a zero. "Trades with R between 1 and 2" cannot honestly include a
// trade whose R was never measured — but "no filter" must not silently drop the
// eleven of twenty-eight trades that have no R at all. Treating null as 0 would put
// unmeasured trades inside every range that spans zero, which is most of them.

export interface NumericRange {
  /** Inclusive lower bound. Null / undefined means unbounded below. */
  min?: number | null
  /** Inclusive upper bound. Null / undefined means unbounded above. */
  max?: number | null
}

/** True when neither bound is set — the filter is dormant and admits everything,
 *  including rows whose value is null. */
export function isRangeActive(r: NumericRange | null | undefined): boolean {
  if (!r) return false
  const hasMin = r.min != null && Number.isFinite(r.min)
  const hasMax = r.max != null && Number.isFinite(r.max)
  return hasMin || hasMax
}

/** Does `value` satisfy `range`? Both bounds inclusive.
 *
 *  An inverted range (min greater than max) matches NOTHING rather than throwing or
 *  silently swapping the bounds — a user mid-typing has expressed an empty set, and
 *  quietly reinterpreting their input would show rows they did not ask for. */
export function matchesRange(
  value: number | null | undefined,
  range: NumericRange | null | undefined,
): boolean {
  if (!isRangeActive(range)) return true
  if (value == null || !Number.isFinite(value)) return false // the null rule
  const { min, max } = range!
  const hasMin = min != null && Number.isFinite(min)
  const hasMax = max != null && Number.isFinite(max)
  if (hasMin && hasMax && (min as number) > (max as number)) return false
  if (hasMin && value < (min as number)) return false
  if (hasMax && value > (max as number)) return false
  return true
}

/** How many rows a range DROPPED because the column was never measured.
 *
 *  WHY THIS TAKES THE ROWS BEFORE THE FILTER RAN, and it is the whole design.
 *  The null rule above puts an unmeasured row in NEITHER the over set nor the
 *  under set, so by the time anything downstream holds a result the dropped
 *  rows are gone. Counting them among the survivors can only ever return zero,
 *  which is exactly what a previous attempt measured on every one of five
 *  thousand one hundred and eighty eight driven asks.
 *
 *  An EXCLUSION is the opposite shape and is counted elsewhere, by
 *  countUnmeasuredKept, from the rows that survived. One function cannot serve
 *  both without being handed both row sets and told which it is looking at.
 *
 *  Returns null when no range is active -- there is nothing to say. Returns
 *  ONE ENTRY PER ACTIVE RANGE, in the order the ranges were typed, each with
 *  its own count. A zero skip is still reported, so the caller can tell
 *  "fully covered" from "not asked".
 *
 *  REVERSED BY BEAT TWO HUNDRED ELEVEN. The loop below used to end with a
 *  `return` inside the body, so it reported the FIRST active range and stopped.
 *  The sentence then named one column and stayed silent about the other, and
 *  WHICH one it named depended on the order the trader happened to type them.
 *  Beat two hundred nine measured the two orders disagreeing on the same book;
 *  this beat is the one that reverses it.
 *
 *  NOT SUMMED, AND THAT WAS RULED RATHER THAN ASSUMED. Adding the per-column
 *  counts double counts any row missing BOTH columns, so the summed number is
 *  not a count of anything. Each column carries its own count instead. */
/** THE WORD A COLUMN IS NAMED BY when the coverage clause has to say WHICH
 *  column it is talking about. Spoken words rather than column ids, because
 *  the sentence is read aloud in the trader's head and "rvol" is not.
 *
 *  ONE ENTRY PER NUMERIC COLUMN, and a guard asserts that, because a column
 *  reaching the sentence without a word here would print undefined at the
 *  reader. Where the resolver already accepts a spoken phrase for the column
 *  the word is THAT phrase, so what the trader is shown is something they can
 *  type back. */
export const COVERAGE_WORDS: Record<string, string> = {
  shares: 'shares',
  avg_buy: 'entry price',
  avg_sell: 'exit price',
  fees: 'fees',
  net_pnl: 'net profit or loss',
  float: 'float',
  hold_time: 'hold time',
  price_move_pct: 'price move',
  pnl_gain_pct: 'percent gain',
  exec_count: 'fill count',
  first_entry: 'first entry time',
  stop_price: 'stop price',
  r_multiple: 'R multiple',
  risk_per_share: 'risk per share',
  total_risk: 'total risk',
  rvol: 'relative volume',
  daily_change_pct: 'day change',
  confidence: 'confidence',
  days_since_catalyst: 'catalyst age',
  mae: 'MAE',
  mfe: 'MFE',
  market_cap: 'market cap',
  vwap_dist_pct: 'VWAP distance',
  ema9_dist_pct: 'EMA9 distance',
  ema20_dist_pct: 'EMA20 distance',
}

export function countDroppedUnmeasured<T>(
  preFilterRows: readonly T[],
  ranges: Record<string, NumericRange | undefined>,
  read: (row: T, columnId: string) => number | null,
): { skipped: number; column: string }[] | null {
  const out: { skipped: number; column: string }[] = []
  for (const [column, r] of Object.entries(ranges)) {
    if (!isRangeActive(r)) continue
    let skipped = 0
    for (const row of preFilterRows) {
      const v = read(row, column)
      if (v == null || !Number.isFinite(v)) skipped += 1
    }
    out.push({ skipped, column })
  }
  return out.length > 0 ? out : null
}

/** Apply a map of column-id -> range to a list, using a per-column value reader.
 *  Every range must pass (AND across columns), matching how the existing filters
 *  compose. */
export function applyRanges<T>(
  rows: readonly T[],
  ranges: Readonly<Record<string, NumericRange>>,
  valueOf: (row: T, columnId: string) => number | null | undefined,
): T[] {
  const active = Object.entries(ranges).filter(([, r]) => isRangeActive(r))
  if (active.length === 0) return [...rows]
  return rows.filter((row) =>
    active.every(([columnId, range]) => matchesRange(valueOf(row, columnId), range)),
  )
}

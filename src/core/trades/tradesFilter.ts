// Pure trades-filter logic for the Trades tab — the filter-state shape and the
// predicate that narrows the loaded trade list. Platform-free: NO electron / fs
// / node / react / DB imports (mirrors src/core/trades/tradeNavigation.ts's
// discipline). It imports only pure-core siblings (the outcome classifier) and
// shared types, so it ports to the Next.js target unchanged. The UI — the
// Segmented control, the option labels, the filter-bar render — stays in
// src/components/trades/TradesFilters.tsx and imports these symbols back.

import type { TradeListRow } from '@shared/trades-types'
import type { MistakeAxis } from '@shared/mistakes-types'
import type { DatePreset } from '@/core/trades/datePreset'
import { isWin, isLoss } from '@/core/classify/outcome'
import {
  applyRanges,
  isRangeActive,
  matchesRange,
  type NumericRange,
} from '@/core/trades/numericRange'
import { holdTimeSeconds, pnlGainPct } from '@/core/trades/tradeMetrics'
import { computeExecutionStats } from '@/core/trades/executionStats'

export type SideFilter = 'all' | 'long' | 'short'
export type DurationFilter = 'all' | 'under1m' | '1to5m' | '5to30m' | 'over30m'
export type OutcomeFilter = 'all' | 'winners' | 'losers'

/** v0.2.7 — the five-pillar ask: a score bar and a completeness bucket. */
export interface DnaFilterAsk {
  minScore: number | null
  bucket: 'any' | 'complete' | 'incomplete'
}

export interface TradesFilterState {
  symbol: string
  side: SideFilter
  duration: DurationFilter
  dateFrom: string
  dateTo: string
  /** v0.2.7 — the quick-filter chip the user chose, when they chose one, as an
   *  INTENT rather than the window it happened to mean at the time. dateFrom /
   *  dateTo remain authoritative for filtering; when this is set they are
   *  DERIVED from it and re-derived against the clock on every restore, so a
   *  "Today" stored yesterday is today again rather than a hard range over
   *  yesterday under a chip that reads as unset. `null` = a hand-picked range
   *  (or none), which the clock must never overwrite.
   *  See core/trades/datePreset.ts. */
  datePreset: DatePreset | null
  outcome: OutcomeFilter
  aPlus: boolean
  mistakesOnly: boolean
  /** Selected PRIMARY playbook ids to keep (OR within the set). A `null` in the
   *  array is the "No playbook" bucket — truly-untagged trades (playbook_id ===
   *  null), distinct from the seeded "No Setup" SYSTEM playbook (a real numeric
   *  id like any other). Empty array = no playbook filtering. */
  playbookIds: (number | null)[]
  /** Selected mistakes to keep, keyed by (axis, name) — OR within the set. Keyed
   *  by axis+name, NOT id: the trade row carries mistake NAMES (`mistakes`) and
   *  `{name, axis}` tags (`mistakeTags`), never mistake ids; and the same name
   *  can exist on both axes (the vocabulary unique index is (axis, lower(name))),
   *  so name-alone would conflate the axes. Empty array = no mistakes filtering. */
  mistakeKeys: { axis: MistakeAxis; name: string }[]
  /** Selected catalyst NAMES to keep (OR within the set). A `null` is the "No
   *  catalyst" bucket — untagged trades (catalyst_type === null). Matched by name,
   *  not id: catalyst is a free-form string column (trades.catalyst_type), no FK.
   *  Empty array = no catalyst filtering. */
  catalystTypes: (string | null)[]
  /** v0.2.7 — selected REGIONS to keep (OR within the set), matched against
   *  TradeListRow.region (the bucket key: USA, China, Hong Kong, ...). The
   *  list read coalesces a missing region to the STRING 'Unknown', so the
   *  `null` bucket here matches that sentinel (and any falsy region), NOT a
   *  null cell — the row never carries one. Hong Kong is its own region and
   *  is never folded into China (only Macau is, upstream in REGION_MAP).
   *  Empty array = no region filtering. */
  regions: (string | null)[]
  /** v0.2.7 — selected COUNTRIES to keep (OR within the set), matched by ISO
   *  3166-1 alpha-2 against TradeListRow.country, which IS nullable — so
   *  `null` here is the truly-unresolved bucket (failed FMP fetch, manual
   *  trade, user cleared it), exactly playbookIds' idiom. Empty array = no
   *  country filtering. */
  countries: (string | null)[]
  /** v0.2.7 — selected SECTORS to keep (OR within, AND across), matched
   *  against the market-data join's sector. `null` = the unresolved bucket
   *  (no market_data row / FMP had nothing) — sector IS nullable on the row,
   *  so this is the countries idiom, not the regions sentinel. */
  sectors: (string | null)[]
  /** Same idiom on the finer grain (industry). */
  industries: (string | null)[]
  /** v0.2.7 -- the 1-minute MACD sign. 'positive', 'negative', or NULL for
   *  the uncomputed bucket, which is the array machinery's own untagged
   *  member and is why this is a list rather than a flag. */
  macdStates: (string | null)[]
  /** v0.2.7 — the five-pillar ASK, never the thresholds. minScore matches
   *  scored trades with passed >= minScore; an INCOMPLETE trade (missing any
   *  required input) never matches a score ask and never fails one — it is its
   *  own bucket, reachable by name, because on a lightly-journaled book it is
   *  most of the answer. Thresholds live in settings; the verdict is attached
   *  to the rows upstream (TradeListRow.dna via withDnaScores), so the same
   *  stored ask re-resolves when the scan profile changes. A row nobody scored
   *  counts as incomplete — the honest default. Empty ask = {null,'any'}. */
  dna: DnaFilterAsk
  /** v0.2.7 — min/max per NUMERIC column, keyed by the table's column id. Empty or
   *  all-unset means no range filtering. The comparison itself lives in ONE place
   *  (core/trades/numericRange.ts) so fifteen columns cannot drift into fifteen
   *  slightly different notions of "between". */
  ranges: Record<string, NumericRange>
  /** v0.2.7 — how many rows to SHOW. NOT a filter: a filter narrows which
   *  trades QUALIFY, a limit hides trades that do. That difference is why it
   *  is never persisted (a hidden row must not survive a reload) and why the
   *  response line names the matched count as well as the shown one.
   *  Null = show everything that matched. */
  /** v0.2.7 — the EIGHT EXCLUDE sides, parallel to the eight include arrays
   *  above. Added rather than folding a sign into each entry: the recon costed
   *  a signed shape at a persistence VERSION BUMP (discarding every stored
   *  filter once) plus four dropdown components rewritten, against nothing at
   *  all for these. Empty = no exclusion.
   *
   *  A row whose value is NULL SURVIVES an exclusion — see MATCHERS. */
  excludePlaybookIds: (number | null)[]
  excludeMistakeKeys: { axis: MistakeAxis; name: string }[]
  excludeCatalystTypes: (string | null)[]
  excludeRegions: (string | null)[]
  excludeCountries: (string | null)[]
  excludeSectors: (string | null)[]
  excludeIndustries: (string | null)[]
  excludeMacdStates: (string | null)[]
  /** v0.2.7 -- THE EXCLUDE SIDE OF THE TEN FIELDS THAT HAD NONE.
   *
   *  A field earned a place here by a TWIN TEST, not by looking excludable: an
   *  SQL twin for "every row that does NOT match this filter" had to be
   *  writable from the schema and had to reconcile, matched plus excluded
   *  equal to the book, on three books. Ten did. Three did not, and they are
   *  named in queryResolver as UNEXCLUDABLE_FIELDS with a reason each.
   *
   *  ADDITIVE AT THE SAME PERSISTENCE STAMP, exactly the idiom the eight
   *  arrays above established: an older stored blob simply lacks these keys
   *  and lands on the empty default, keeping everything else it stored. */
  excludeSymbols: string[]
  excludeSides: string[]
  excludeOutcomes: string[]
  excludeDurations: string[]
  excludeDateFrom: string
  excludeDateTo: string
  excludeMistakesOnly: boolean
  excludeAPlus: boolean
  /** A RANGE exclusion. Its unknown row behaves the OPPOSITE way from an
   *  include range: see the predicate below. */
  excludeRanges: Record<string, NumericRange>
  limit: number | null
  /** v0.2.7 — the ordering a SENTENCE asked for, distinct from the ordering
   *  the user clicked. The table's own sort is user state; this is the ask's,
   *  and it exists so "the last ten" means the same thing tomorrow as today.
   *  Null = the table keeps its own sort, untouched. */
  sort: { colId: string; dir: 'asc' | 'desc' } | null
}

/** Reads the value a range filters on, per column id. Centralised here so the
 *  filter and the table agree on what a column MEANS without the component
 *  re-deriving anything. */
/** ONE predicate per array field: "does this row POSITIVELY match this value".
 *  Shared by the include and exclude blocks so the two can never disagree --
 *  and the reason exclusion leaves null rows alone falls out of it, because a
 *  row with no value positively matches nothing.
 *
 *  `null` is the UNTAGGED bucket in every one of them, matched explicitly so
 *  it can never collide with a real value. */
const MATCHERS = {
  playbookIds: (t: TradeListRow, v: number | null) =>
    v === null ? t.playbook_id === null : t.playbook_id === v,
  mistakeKeys: (t: TradeListRow, v: { axis: MistakeAxis; name: string }) =>
    (t.mistakeTags ?? []).some((tag) => tag.axis === v.axis && tag.name === v.name),
  catalystTypes: (t: TradeListRow, v: string | null) =>
    v === null ? t.catalyst_type === null : t.catalyst_type === v,
  // region is never null ON THE ROW; list.ts coalesces it to the sentinel.
  regions: (t: TradeListRow, v: string | null) =>
    v === null ? t.region === 'Unknown' || !t.region : t.region === v,
  countries: (t: TradeListRow, v: string | null) =>
    v === null ? t.country == null : t.country === v,
  sectors: (t: TradeListRow, v: string | null) =>
    v === null ? t.sector == null : t.sector === v,
  industries: (t: TradeListRow, v: string | null) =>
    v === null ? t.industry == null : t.industry === v,
  // THREE-VALUED, and the null member is the point: a trade whose MACD was
  // never computed is not positive and not negative, and a facet that could
  // not name it would answer "eighty-three" while hiding four hundred and
  // thirty-nine trades it never looked at.
  macdStates: (t: TradeListRow, v: string | null) =>
    v === null
      ? t.tf_1m_macd_positive == null
      : v === 'positive'
        ? t.tf_1m_macd_positive === true
        : t.tf_1m_macd_positive === false,
} as const

type ArrayPair = [readonly unknown[], (t: TradeListRow, v: never) => boolean]

const ARRAY_FIELDS = (f: TradesFilterState): ArrayPair[] => [
  [f.playbookIds, MATCHERS.playbookIds as never],
  [f.mistakeKeys, MATCHERS.mistakeKeys as never],
  [f.catalystTypes, MATCHERS.catalystTypes as never],
  [f.regions, MATCHERS.regions as never],
  [f.countries, MATCHERS.countries as never],
  [f.sectors, MATCHERS.sectors as never],
  [f.industries, MATCHERS.industries as never],
  [f.macdStates, MATCHERS.macdStates as never],
]

const EXCLUDED_FIELDS = (f: TradesFilterState): ArrayPair[] => [
  [f.excludePlaybookIds, MATCHERS.playbookIds as never],
  [f.excludeMistakeKeys, MATCHERS.mistakeKeys as never],
  [f.excludeCatalystTypes, MATCHERS.catalystTypes as never],
  [f.excludeRegions, MATCHERS.regions as never],
  [f.excludeCountries, MATCHERS.countries as never],
  [f.excludeSectors, MATCHERS.sectors as never],
  [f.excludeIndustries, MATCHERS.industries as never],
  [f.excludeMacdStates, MATCHERS.macdStates as never],
]

/** Of the rows an EXCLUSION kept, how many were never measured.
 *
 *  THE OPPOSITE SHAPE FROM A RANGE, and that is why it is a second function.
 *  The shared predicate above answers "does this row POSITIVELY match", so a
 *  row with no value matches nothing and SURVIVES the exclusion. It is still
 *  in the result, which means the count is taken from the rows the caller
 *  already holds rather than from the rows before the filter ran.
 *
 *  The number this returns is what made the item worth building: on the
 *  largest book, excluding a positive one-minute MACD returns four hundred and
 *  forty five trades, of which four hundred and thirty nine were never
 *  computed at all. Six are genuinely negative. Answering four hundred and
 *  forty five and stopping there is the dishonesty.
 *
 *  Returns null when no exclusion is in force. Returns a zero skip when one IS
 *  in force and every kept row was measured, so a fully covered book is
 *  distinguishable from a book nobody asked about. */
export function countUnmeasuredKept(
  keptRows: readonly TradeListRow[],
  f: TradesFilterState,
): { skipped: number; column: string } | null {
  if (f.excludeMacdStates.length > 0) {
    let skipped = 0
    for (const t of keptRows) if (t.tf_1m_macd_positive == null) skipped += 1
    return { skipped, column: 'macd' }
  }
  // WIDENED for the range exclusion, which keeps its unmeasured rows for the
  // same reason a MACD exclusion does. The counter did not need a sibling: it
  // needed to learn a second way of being handed the same situation.
  for (const [column, r] of Object.entries(f.excludeRanges ?? {})) {
    if (!isRangeActive(r)) continue
    let skipped = 0
    for (const t of keptRows) {
      const v = rangeValueOf(t, column)
      if (v == null || !Number.isFinite(v)) skipped += 1
    }
    return { skipped, column }
  }
  return null
}

export function rangeValueOf(t: TradeListRow, columnId: string): number | null {
  switch (columnId) {
    case 'net_pnl': return t.net_pnl
    case 'fees': return t.total_fees
    case 'shares': return Math.max(t.shares_bought, t.shares_sold)
    case 'avg_buy': return t.avg_buy_price
    case 'avg_sell': return t.avg_sell_price
    case 'hold_time': return holdTimeSeconds(t)
    case 'pnl_gain_pct': return pnlGainPct(t)
    case 'price_move_pct': return computeExecutionStats(t).priceMovePct
    case 'first_entry': return computeExecutionStats(t).firstEntry?.price ?? null
    case 'exec_count': return t.executions.length
    case 'stop_price': return t.planned_stop_loss_price
    case 'r_multiple': return t.r_multiple
    case 'risk_per_share': return t.risk_per_share
    case 'total_risk': return t.total_risk
    case 'rvol': return t.rvol
    case 'daily_change_pct': return t.daily_change_pct
    case 'confidence': return t.confidence
    case 'days_since_catalyst': return t.days_since_catalyst
    case 'mae': return t.mae
    case 'mfe': return t.mfe
    case 'float': return t.float_shares
    case 'market_cap': return t.market_cap ?? null
    case 'vwap_dist_pct': return t.tf_1m_vwap_dist_pct ?? null
    case 'ema9_dist_pct': return t.tf_1m_ema9_dist_pct ?? null
    case 'ema20_dist_pct': return t.tf_1m_ema20_dist_pct ?? null
    default: return null
  }
}

/** The MACD states, in ONE place so the resolver's vocabulary, the page and
 *  the panel control cannot drift apart about what the words are.
 *
 *  "MACD NOT COMPUTED" IS NOT A KEY, and that is measured rather than chosen:
 *  "not" is a NEGATOR, so the phrase makes the negation mask fire, governs
 *  "computed", and leaves "macd" to be offered on its own. The DISPLAY matters
 *  as much as the key -- an ambiguity is taken by substituting the candidate
 *  back into the sentence, so a display the resolver cannot read would loop,
 *  which is a boundary an earlier beat measured and recorded. */
export const MACD_STATE_CHOICES: {
  key: string
  display: string
  value: string | null
  label: string
}[] = [
  { key: 'macd positive', display: 'macd positive', value: 'positive', label: 'Positive' },
  { key: 'macd negative', display: 'macd negative', value: 'negative', label: 'Negative' },
  { key: 'macd unknown', display: 'macd unknown', value: null, label: 'Not computed' },
  { key: 'macd uncomputed', display: 'macd unknown', value: null, label: 'Not computed' },
]

export function emptyFilters(): TradesFilterState {
  return {
    symbol: '',
    side: 'all',
    duration: 'all',
    dateFrom: '',
    dateTo: '',
    datePreset: null,
    outcome: 'all',
    aPlus: false,
    mistakesOnly: false,
    playbookIds: [],
    mistakeKeys: [],
    catalystTypes: [],
    regions: [],
    countries: [],
    sectors: [],
    industries: [],
    macdStates: [],
    dna: { minScore: null, bucket: 'any' },
    ranges: {},
    excludePlaybookIds: [],
    excludeMistakeKeys: [],
    excludeCatalystTypes: [],
    excludeRegions: [],
    excludeCountries: [],
    excludeSectors: [],
    excludeIndustries: [],
    excludeMacdStates: [],
    excludeSymbols: [],
    excludeSides: [],
    excludeOutcomes: [],
    excludeDurations: [],
    excludeDateFrom: '',
    excludeDateTo: '',
    excludeMistakesOnly: false,
    excludeAPlus: false,
    excludeRanges: {},
    limit: null,
    sort: null,
  }
}

/** Order a list by the ask's sort, then truncate to its limit. ONE place --
 *  SORT THEN SLICE, and duplicating this decision is exactly how the two would
 *  drift into slicing an unsorted list, which is a wrong answer wearing a
 *  right label. Returns the input unchanged when the ask carries neither. */
export function applyLimitAndSort(
  rows: readonly TradeListRow[],
  f: Pick<TradesFilterState, 'limit' | 'sort'>,
): TradeListRow[] {
  const ordered = f.sort
    ? [...rows].sort((a, b) => {
        const av = sortValueOf(a, f.sort!.colId)
        const bv = sortValueOf(b, f.sort!.colId)
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return f.sort!.dir === 'desc' ? -cmp : cmp
      })
    : [...rows]
  return f.limit == null ? ordered : ordered.slice(0, f.limit)
}

/** The value a SORT reads, per column id. Date sorting uses open_time, the
 *  full timestamp -- the trading day with the intraday order preserved. */
function sortValueOf(t: TradeListRow, colId: string): string | number {
  if (colId === 'open_time') return t.open_time
  return rangeValueOf(t, colId) ?? Number.NEGATIVE_INFINITY
}

export function isFiltering(f: TradesFilterState): boolean {
  return (
    f.symbol.trim() !== '' ||
    f.side !== 'all' ||
    f.duration !== 'all' ||
    f.dateFrom !== '' ||
    f.dateTo !== '' ||
    f.outcome !== 'all' ||
    f.aPlus ||
    f.mistakesOnly ||
    f.playbookIds.length > 0 ||
    f.mistakeKeys.length > 0 ||
    f.catalystTypes.length > 0 ||
    f.regions.length > 0 ||
    f.countries.length > 0 ||
    f.sectors.length > 0 ||
    f.industries.length > 0 ||
    f.macdStates.length > 0 ||
    f.dna.minScore !== null ||
    f.dna.bucket !== 'any' ||
    // A range alone must surface the Clear control, or a user can narrow the table
    // and find no way to widen it again.
    Object.values(f.ranges ?? {}).some(isRangeActive) ||
    // THE SAME RULING, EXTENDED. The sentence above was written for ranges and
    // never reached the exclude arrays, which is how an exclusion became a
    // filter with no way out: emptyFilters() wipes every one, but the Clear
    // button that calls it is gated on THIS predicate, so with an exclusion as
    // the only filter the control never rendered and re-typing the query was
    // the only escape. Two further consumers read the same answer -- the header
    // count and the Edge disc's remembering dot -- so all three were reporting
    // "nothing is filtering" while the table was visibly narrowed.
    //
    // Only Edge can author one today, which is precisely why they must be
    // clearable: the user never chose the exclusion from a control they could
    // go back to.
    f.excludePlaybookIds.length > 0 ||
    f.excludeMistakeKeys.length > 0 ||
    f.excludeCatalystTypes.length > 0 ||
    f.excludeRegions.length > 0 ||
    f.excludeCountries.length > 0 ||
    f.excludeSectors.length > 0 ||
    f.excludeIndustries.length > 0 ||
    f.excludeMacdStates.length > 0 ||
    // The ten. Same ruling as the arrays above: an exclusion alone must
    // surface the Clear control, or the only way out is to re-type the ask.
    f.excludeSymbols.length > 0 ||
    f.excludeSides.length > 0 ||
    f.excludeOutcomes.length > 0 ||
    f.excludeDurations.length > 0 ||
    f.excludeDateFrom !== '' ||
    f.excludeDateTo !== '' ||
    f.excludeMistakesOnly ||
    f.excludeAPlus ||
    Object.values(f.excludeRanges ?? {}).some(isRangeActive)
  )
}

// Pure filter applied to the trade list. Open trades fail any duration filter
// other than 'all' since hold time is undefined for them.
export function applyTradesFilters(
  trades: TradeListRow[],
  f: TradesFilterState,
): TradeListRow[] {
  const symbolQuery = f.symbol.trim().toLowerCase()
  // v0.2.7: ranges COMPOSE with everything below rather than replacing any of it —
  // the existing predicate runs first, then the shared range helper narrows what
  // survives. AND across both, matching how the other filters already combine.
  const narrowed = trades.filter((t) => {
    if (symbolQuery && !t.symbol.toLowerCase().includes(symbolQuery)) return false
    if (f.side !== 'all' && t.side !== f.side) return false
    if (f.duration !== 'all') {
      if (t.is_open || !t.close_time) return false
      const hold = (Date.parse(t.close_time) - Date.parse(t.open_time)) / 1000
      if (!Number.isFinite(hold)) return false
      if (f.duration === 'under1m' && hold >= 60) return false
      if (f.duration === '1to5m' && (hold < 60 || hold >= 300)) return false
      if (f.duration === '5to30m' && (hold < 300 || hold >= 1800)) return false
      if (f.duration === 'over30m' && hold < 1800) return false
    }
    if (f.dateFrom && t.date < f.dateFrom) return false
    if (f.dateTo && t.date > f.dateTo) return false
    if (f.outcome === 'winners' && !isWin(t.net_pnl)) return false
    if (f.outcome === 'losers' && !isLoss(t.net_pnl)) return false
    // v0.1.5: A+ Setups filter now reads the playbook's tier classification
    // rather than the per-trade confidence (which was a v0.1.3 stop-gap).
    // A trade without a playbook is excluded — there's no claim of A+
    // discipline if no setup was tagged.
    if (f.aPlus && t.playbook_tier !== 'A+') return false
    if (f.mistakesOnly && t.mistakes.length === 0) return false
    // THE EIGHT ARRAY FIELDS. Each has ONE predicate, defined once above and
    // called from BOTH the include block and the exclude block below. Two
    // copies is how they drift, and a drifted pair means the same row can be
    // kept by one half and removed by the other depending on which ran.
    //
    // INCLUDE: at least one selected value must match (OR within the set, AND
    // across fields). EXCLUDE: no excluded value may match -- and because the
    // predicate answers "does this row POSITIVELY match this value", a row
    // whose field is null matches nothing and therefore SURVIVES. Excluding
    // China removes China; it does not remove everything unlabelled.
    for (const [values, pred] of ARRAY_FIELDS(f)) {
      if (values.length === 0) continue
      if (!values.some((v) => pred(t, v as never))) return false
    }
    for (const [values, pred] of EXCLUDED_FIELDS(f)) {
      if (values.length === 0) continue
      if (values.some((v) => pred(t, v as never))) return false
    }
    // THE TEN. Every one obeys the same law as the arrays above: a row is
    // removed only when it POSITIVELY matches an excluded value, so a row
    // with nothing recorded for that field is never swept away by an
    // exclusion it was never part of.
    if (f.excludeSymbols.length > 0 && f.excludeSymbols.includes(t.symbol)) return false
    if (f.excludeSides.length > 0 && f.excludeSides.includes(t.side)) return false
    for (const o of f.excludeOutcomes) {
      if (o === 'winners' && isWin(t.net_pnl)) return false
      if (o === 'losers' && isLoss(t.net_pnl)) return false
    }
    if (f.excludeDurations.length > 0 && !t.is_open && t.close_time) {
      // Mirrors the include block above rather than inventing a bucket helper,
      // so the two can never disagree about where a boundary sits.
      const hold = (Date.parse(t.close_time) - Date.parse(t.open_time)) / 1000
      if (Number.isFinite(hold)) {
        for (const d of f.excludeDurations) {
          if (d === 'under1m' && hold < 60) return false
          if (d === '1to5m' && hold >= 60 && hold < 300) return false
          if (d === '5to30m' && hold >= 300 && hold < 1800) return false
          if (d === 'over30m' && hold >= 1800) return false
        }
      }
    }
    if (f.excludeMistakesOnly && (t.mistakeTags ?? []).length > 0) return false
    if (f.excludeAPlus && t.playbook_tier === 'A+') return false
    // ONE test, not two. A row is excluded only when it falls INSIDE the
    // excluded window; either bound may be open.
    if (f.excludeDateFrom !== '' || f.excludeDateTo !== '') {
      const afterFrom = f.excludeDateFrom === '' || t.date >= f.excludeDateFrom
      const beforeTo = f.excludeDateTo === '' || t.date <= f.excludeDateTo
      if (afterFrom && beforeTo) return false
    }
    // A RANGE EXCLUSION IS THE NEGATION OF matchesRange, AND THAT DECIDES THE
    // UNKNOWN ROW. matchesRange returns FALSE for a value nobody measured, so
    // the negation returns TRUE and the row SURVIVES -- the same answer the
    // array exclusions give, reached by the same reasoning. It is why
    // countUnmeasuredKept, and never countDroppedUnmeasured, is the honest
    // counter for this shape: the rows are in the result, not removed from it.
    for (const [col, r] of Object.entries(f.excludeRanges ?? {})) {
      if (!isRangeActive(r)) continue
      if (matchesRange(rangeValueOf(t, col), r)) return false
    }
    // Five-pillar filter — reads the verdict withDnaScores attached upstream.
    // A row without one is INCOMPLETE, not scored: treating it as anything
    // else would invent a verdict nobody computed.
    if (f.dna.minScore !== null || f.dna.bucket !== 'any') {
      const s = t.dna
      const scored = s && s.kind === 'scored' ? s : null
      if (f.dna.bucket === 'complete' && !scored) return false
      if (f.dna.bucket === 'incomplete' && scored) return false
      if (f.dna.minScore !== null && (!scored || scored.passed < f.dna.minScore)) return false
    }
    return true
  })
  return applyRanges(narrowed, f.ranges ?? {}, rangeValueOf)
}

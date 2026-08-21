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
import { applyRanges, isRangeActive, type NumericRange } from '@/core/trades/numericRange'
import { holdTimeSeconds, pnlGainPct } from '@/core/trades/tradeMetrics'
import { computeExecutionStats } from '@/core/trades/executionStats'

export type SideFilter = 'all' | 'long' | 'short'
export type DurationFilter = 'all' | 'under1m' | '1to5m' | '5to30m' | 'over30m'
export type OutcomeFilter = 'all' | 'winners' | 'losers'

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
  /** v0.2.7 — min/max per NUMERIC column, keyed by the table's column id. Empty or
   *  all-unset means no range filtering. The comparison itself lives in ONE place
   *  (core/trades/numericRange.ts) so fifteen columns cannot drift into fifteen
   *  slightly different notions of "between". */
  ranges: Record<string, NumericRange>
}

/** Reads the value a range filters on, per column id. Centralised here so the
 *  filter and the table agree on what a column MEANS without the component
 *  re-deriving anything. */
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
    default: return null
  }
}

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
    ranges: {},
  }
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
    // A range alone must surface the Clear control, or a user can narrow the table
    // and find no way to widen it again.
    Object.values(f.ranges ?? {}).some(isRangeActive)
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
    // Primary-playbook filter — OR within the selected set. `null` is the
    // "No playbook" bucket (untagged trades), matched explicitly so it never
    // collides with a real id (incl. the "No Setup" system playbook's id).
    if (f.playbookIds.length > 0) {
      const matches = f.playbookIds.some((id) =>
        id === null ? t.playbook_id === null : t.playbook_id === id,
      )
      if (!matches) return false
    }
    // Mistakes filter — OR within the selected set, matched by (axis, name)
    // against the row's axis-aware tags. The row carries no mistake ids, and the
    // same name can live on both axes, so the match is axis-qualified (never
    // name-alone). mistakeTags is optional in the type (fixtures) though the real
    // list read always populates it; guard with ?? [].
    if (f.mistakeKeys.length > 0) {
      const tags = t.mistakeTags ?? []
      const matches = f.mistakeKeys.some((k) =>
        tags.some((tag) => tag.axis === k.axis && tag.name === k.name),
      )
      if (!matches) return false
    }
    // Catalyst filter — OR within the selected set, matched by exact name against
    // the row's catalyst_type string. `null` is the "No catalyst" bucket (untagged
    // trades), matched strictly so it never collides with a real name.
    if (f.catalystTypes.length > 0) {
      const matches = f.catalystTypes.some((c) =>
        c === null ? t.catalyst_type === null : t.catalyst_type === c,
      )
      if (!matches) return false
    }
    // Region filter — OR within the set, AND against everything else. `null`
    // matches the 'Unknown' sentinel the list read writes for an unresolved
    // row (region is never null ON THE ROW; list.ts coalesces it).
    if (f.regions.length > 0) {
      const matches = f.regions.some((r) =>
        r === null ? t.region === 'Unknown' || !t.region : t.region === r,
      )
      if (!matches) return false
    }
    // Country filter — OR within the set, matched by ISO alpha-2. `null` is
    // the truly-unresolved bucket: country IS nullable on the row.
    if (f.countries.length > 0) {
      const matches = f.countries.some((c) =>
        c === null ? t.country == null : t.country === c,
      )
      if (!matches) return false
    }
    return true
  })
  return applyRanges(narrowed, f.ranges ?? {}, rangeValueOf)
}

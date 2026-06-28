// Pure trades-filter logic for the Trades tab — the filter-state shape and the
// predicate that narrows the loaded trade list. Platform-free: NO electron / fs
// / node / react / DB imports (mirrors src/core/trades/tradeNavigation.ts's
// discipline). It imports only pure-core siblings (the outcome classifier) and
// shared types, so it ports to the Next.js target unchanged. The UI — the
// Segmented control, the option labels, the filter-bar render — stays in
// src/components/trades/TradesFilters.tsx and imports these symbols back.

import type { TradeListRow } from '@shared/trades-types'
import type { MistakeAxis } from '@shared/mistakes-types'
import { isWin, isLoss } from '@/core/classify/outcome'

export type SideFilter = 'all' | 'long' | 'short'
export type DurationFilter = 'all' | 'under1m' | '1to5m' | '5to30m' | 'over30m'
export type OutcomeFilter = 'all' | 'winners' | 'losers'

export interface TradesFilterState {
  symbol: string
  side: SideFilter
  duration: DurationFilter
  dateFrom: string
  dateTo: string
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
}

export function emptyFilters(): TradesFilterState {
  return {
    symbol: '',
    side: 'all',
    duration: 'all',
    dateFrom: '',
    dateTo: '',
    outcome: 'all',
    aPlus: false,
    mistakesOnly: false,
    playbookIds: [],
    mistakeKeys: [],
    catalystTypes: [],
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
    f.catalystTypes.length > 0
  )
}

// Pure filter applied to the trade list. Open trades fail any duration filter
// other than 'all' since hold time is undefined for them.
export function applyTradesFilters(
  trades: TradeListRow[],
  f: TradesFilterState,
): TradeListRow[] {
  const symbolQuery = f.symbol.trim().toLowerCase()
  return trades.filter((t) => {
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
    return true
  })
}

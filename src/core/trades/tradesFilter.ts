// Pure trades-filter logic for the Trades tab — the filter-state shape and the
// predicate that narrows the loaded trade list. Platform-free: NO electron / fs
// / node / react / DB imports (mirrors src/core/trades/tradeNavigation.ts's
// discipline). It imports only pure-core siblings (the outcome classifier) and
// shared types, so it ports to the Next.js target unchanged. The UI — the
// Segmented control, the option labels, the filter-bar render — stays in
// src/components/trades/TradesFilters.tsx and imports these symbols back.

import type { TradeListRow } from '@shared/trades-types'
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
    f.playbookIds.length > 0
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
    return true
  })
}

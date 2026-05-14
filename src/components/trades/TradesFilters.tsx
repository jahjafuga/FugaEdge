import { Search, X } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'

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
    f.mistakesOnly
  )
}

const SIDE_OPTS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
]

const DURATION_OPTS: { key: DurationFilter; label: string }[] = [
  { key: 'all', label: 'Any duration' },
  { key: 'under1m', label: '< 1m' },
  { key: '1to5m', label: '1–5m' },
  { key: '5to30m', label: '5–30m' },
  { key: 'over30m', label: '> 30m' },
]

interface TradesFiltersProps {
  filters: TradesFilterState
  onChange: (next: TradesFilterState) => void
  trades: TradeListRow[]
}

export default function TradesFilters({ filters, onChange, trades: _trades }: TradesFiltersProps) {
  const filtering = isFiltering(filters)

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-2 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-bg-1 px-2.5 transition-colors duration-150 focus-within:border-gold">
          <Search size={14} strokeWidth={1.75} className="text-fg-tertiary" />
          <input
            value={filters.symbol}
            onChange={(e) => onChange({ ...filters, symbol: e.target.value })}
            placeholder="Symbol"
            className="w-24 bg-transparent text-sm uppercase text-fg-primary placeholder:text-fg-muted focus:outline-none"
          />
          {filters.symbol && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, symbol: '' })}
              className="cursor-pointer text-fg-muted hover:text-fg-secondary"
              aria-label="Clear symbol"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        <Segmented
          options={SIDE_OPTS}
          value={filters.side}
          onChange={(v) => onChange({ ...filters, side: v })}
        />

        <Segmented
          options={DURATION_OPTS}
          value={filters.duration}
          onChange={(v) => onChange({ ...filters, duration: v })}
        />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            From
          </span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="h-8 cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            To
          </span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="h-8 cursor-pointer rounded-md border border-border-subtle bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
          />
        </div>

        {filtering && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters())}
            className="ml-auto inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" className="inline-flex h-8 rounded-md border border-border-subtle bg-bg-1 p-0.5">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
 className={`cursor-pointer rounded-[5px] px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
              active ? 'bg-gold text-accent-ink' : 'text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
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
    if (f.outcome === 'winners' && t.net_pnl <= 0) return false
    if (f.outcome === 'losers' && t.net_pnl >= 0) return false
    // v0.1.5: A+ Setups filter now reads the playbook's tier classification
    // rather than the per-trade confidence (which was a v0.1.3 stop-gap).
    // A trade without a playbook is excluded — there's no claim of A+
    // discipline if no setup was tagged.
    if (f.aPlus && t.playbook_tier !== 'A+') return false
    if (f.mistakesOnly && t.mistakes.length === 0) return false
    return true
  })
}

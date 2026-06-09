// Technical Analysis tab. Commit 5 (Session 4) landed the filter bar with
// hot, renderer-only filter state (date preset + range, ticker, playbook,
// 1M/5M timeframe). The Header Strip cards and the six aggregation sections
// (MACD state grid, VWAP/EMA distance, combined signal reads, time-of-day)
// land in Commit 6+; the placeholder card below stands in until the cards
// work lands.

import { useState } from 'react'
import TechnicalsFilterBar, {
  type TechnicalsFilters,
} from './technicals/TechnicalsFilterBar'
import { rangeForDatePreset } from '@/core/technicals/datePreset'

export default function TechnicalsTab() {
  const [filters, setFilters] = useState<TechnicalsFilters>(() => ({
    datePreset: '30d',
    range: rangeForDatePreset('30d'),
    ticker: '',
    playbookName: null,
    timeframe: '1m',
  }))

  return (
    <div className="space-y-6">
      <TechnicalsFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        playbookOptions={[]}
      />
      <div className="rounded-lg border border-border-subtle bg-bg-2 p-6 text-center text-sm text-fg-secondary">
        Technical Analysis tab — in development.
      </div>
    </div>
  )
}

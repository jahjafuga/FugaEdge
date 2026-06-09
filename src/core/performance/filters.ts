// Pure filter logic for the Reports Overview tab. Reads from a
// TradeListRow snapshot and an OverviewFilters object — returns a new
// filtered array. Used by both the normal-view and compare-view paths.

import type { TradeListRow } from '@shared/trades-types'
import type { DurationBucket, OverviewFilters } from './types'

function durationSeconds(t: TradeListRow): number | null {
  if (!t.close_time || t.is_open) return null
  const open = Date.parse(t.open_time)
  const close = Date.parse(t.close_time)
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null
  const s = (close - open) / 1000
  return s > 0 ? s : null
}

function inDurationBucket(t: TradeListRow, bucket: DurationBucket): boolean {
  if (bucket === 'all') return true
  const s = durationSeconds(t)
  if (s == null) return false
  if (bucket === 'under-1m') return s < 60
  if (bucket === '1-5m') return s >= 60 && s < 300
  if (bucket === '5-30m') return s >= 300 && s < 1800
  return s >= 1800
}

export function emptyFilters(): OverviewFilters {
  return {
    symbol: '',
    playbooks: [],
    catalysts: [],
    mistakes: [],
    side: 'all',
    duration: 'all',
    range: null,
  }
}

export function applyFilters(
  trades: TradeListRow[],
  filters: OverviewFilters,
): TradeListRow[] {
  const sym = filters.symbol.trim().toUpperCase()
  const playbookSet = new Set(filters.playbooks.map((p) => p.toLowerCase()))
  const catalystSet = new Set(filters.catalysts.map((c) => c.toLowerCase()))
  const mistakeSet = new Set(filters.mistakes.map((m) => m.toLowerCase()))

  return trades.filter((t) => {
    if (sym && !t.symbol.toUpperCase().includes(sym)) return false
    if (filters.side !== 'all' && t.side !== filters.side) return false
    if (!inDurationBucket(t, filters.duration)) return false
    if (filters.range) {
      if (t.date < filters.range.from || t.date > filters.range.to) return false
    }
    if (playbookSet.size > 0) {
      const name = (t.playbook_name ?? '').toLowerCase()
      if (!playbookSet.has(name)) return false
    }
    if (catalystSet.size > 0) {
      const c = (t.catalyst_type ?? '').toLowerCase()
      if (!catalystSet.has(c)) return false
    }
    if (mistakeSet.size > 0) {
      const hits = t.mistakes.some((m) => mistakeSet.has(m.toLowerCase()))
      if (!hits) return false
    }
    return true
  })
}

/**
 * Extract distinct, non-null playbook names from any
 * collection of rows that carry a playbook_name field.
 * Structurally typed (not nominally bound to TradeListRow)
 * so it can also accept the leaner TradeWithTechnicalsRow
 * used by the v0.2.4 Technicals filter bar.
 */
export function distinctPlaybooks(trades: { playbook_name: string | null }[]): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (t.playbook_name) set.add(t.playbook_name)
  }
  return Array.from(set).sort()
}

export function distinctCatalysts(trades: TradeListRow[]): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (t.catalyst_type) set.add(t.catalyst_type)
  }
  return Array.from(set).sort()
}

export function distinctMistakes(trades: TradeListRow[]): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    for (const m of t.mistakes) {
      if (m) set.add(m)
    }
  }
  return Array.from(set).sort()
}

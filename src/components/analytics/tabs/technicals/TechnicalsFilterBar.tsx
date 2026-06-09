// v0.2.4 Session 4 (Commit 5) — Technical Analysis filter bar. Dumb and
// fully controlled: it renders the filter chrome and reports edits up via
// onFiltersChange. It owns no data, makes no IPC call, and runs no
// aggregation — Commit 6 populates the playbook options and wires the Header
// Strip cards beneath it. Class strings mirror the Reports Overview FilterBar
// (sticky wrapper, ticker input, inline DateField) and the CatalystEditor
// native <select>, reusing the shared ui/Segment toggle for the date-preset
// and 1M/5M controls.
//
// TechnicalsFilters is co-located here: it is renderer-only state and never
// crosses the IPC boundary.

import Segment from '@/components/ui/Segment'
import type { Timeframe } from '@/core/technicals/headerStrip'
import { rangeForDatePreset, type DatePreset } from '@/core/technicals/datePreset'
import type { DateRange } from '@/core/performance/types'

export interface TechnicalsFilters {
  datePreset: DatePreset
  range: DateRange | null
  ticker: string
  playbookName: string | null // null = (All)
  timeframe: Timeframe
}

interface TechnicalsFilterBarProps {
  filters: TechnicalsFilters
  onFiltersChange: (next: TechnicalsFilters) => void
  playbookOptions: string[] // empty in Commit 5; Commit 6 populates it
  excludedCount: number // trades dropped by the data gate (§C:103 chip)
}

export default function TechnicalsFilterBar({
  filters,
  onFiltersChange,
  playbookOptions,
  excludedCount,
}: TechnicalsFilterBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border-subtle bg-bg-1/95 px-4 py-3 font-sans backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {/* Ticker */}
        <input
          type="text"
          value={filters.ticker}
          onChange={(e) => onFiltersChange({ ...filters, ticker: e.target.value })}
          placeholder="Ticker"
          className="h-8 w-28 rounded-md border border-border-strong bg-bg-1 px-2.5 text-xs text-fg-primary placeholder:text-fg-tertiary focus:border-gold focus:outline-none"
        />

        {/* Playbook — native single-select (CatalystEditor pattern), styled
            to match the ticker input to its left. Empty in Commit 5; Commit 6
            passes the derived options. */}
        <select
          value={filters.playbookName ?? ''}
          onChange={(e) => {
            const next = e.target.value === '' ? null : e.target.value
            onFiltersChange({ ...filters, playbookName: next })
          }}
          className="h-8 w-36 cursor-pointer rounded-md border border-border-strong bg-bg-1 px-2 text-xs text-fg-primary transition-colors duration-150 focus:border-gold focus:outline-none"
        >
          <option value="">— All —</option>
          {playbookOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Date-range presets — sets datePreset + range together. No 'custom'
            button: custom is the implicit state when the From/To fields are
            edited, and Segment de-highlights every button at that point. */}
        <Segment<DatePreset>
          options={[
            { value: 'today', label: 'Today' },
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
            { value: '90d', label: '90D' },
            { value: 'ytd', label: 'YTD' },
          ]}
          value={filters.datePreset}
          onChange={(p) =>
            onFiltersChange({
              ...filters,
              datePreset: p,
              range: rangeForDatePreset(p),
            })
          }
        />

        {/* Custom date range — editing either field switches the preset to
            'custom', de-highlighting the preset buttons above. */}
        <div className="flex items-center gap-1">
          <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
            <span>From</span>
            <input
              type="date"
              value={filters.range?.from ?? ''}
              onChange={(e) => {
                const from = e.target.value
                onFiltersChange({
                  ...filters,
                  datePreset: 'custom',
                  range: from ? { from, to: filters.range?.to ?? from } : null,
                })
              }}
              className="border-0 bg-transparent px-1 text-xs text-fg-primary focus:outline-none"
            />
          </label>
          <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
            <span>To</span>
            <input
              type="date"
              value={filters.range?.to ?? ''}
              onChange={(e) => {
                const to = e.target.value
                onFiltersChange({
                  ...filters,
                  datePreset: 'custom',
                  range: to ? { from: filters.range?.from ?? to, to } : null,
                })
              }}
              className="border-0 bg-transparent px-1 text-xs text-fg-primary focus:outline-none"
            />
          </label>
        </div>

        {/* Excluded-data chip (§C:103) — how many trades the data gate
            dropped (no indicator snapshot). Only shown when > 0. Neutral
            tokens: the LivePill shell without the status dot or win tone. */}
        {excludedCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            {excludedCount} excluded (no indicator data)
          </span>
        )}

        {/* 1M/5M timeframe — right-aligned. Independent of the chart's own
            timeframe toggle (spec §H). */}
        <div className="ml-auto">
          <Segment<Timeframe>
            options={[
              { value: '1m', label: '1M' },
              { value: '5m', label: '5M' },
            ]}
            value={filters.timeframe}
            onChange={(t) => onFiltersChange({ ...filters, timeframe: t })}
          />
        </div>
      </div>
    </div>
  )
}

// One bucket's trade table for the inline-expansion accordion (5b.1; generic as
// of F6). Presentational: a hand-rolled 3-column sortable table — Date, Net P&L,
// and a section-supplied distance/value column (MACD line for Section 2; VWAP /
// EMA distance for Sections 3 / 4) — over the rows the section resolved for the
// open cell. Row-click → read-only TradeDetailSheet lands in F6 phase 3.
//
// The third column is parameterized via the `distanceColumn` descriptor (label +
// value extractor + formatter); Date and Net P&L are fixed. Sort is a thin
// Array.sort behind useState (stable in V8, so equal keys keep the input order).
// 8 rows shown by default with a "Show all N" expander.

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from '@/core/technicals/headerStrip'
import { signed, pnlClass } from '@/lib/format'

// The section-supplied third column. `getValue` reads the metric off the row's
// active-timeframe snapshot (a number; the consumer's extractor resolves any null
// operand to 0); `format` renders it. The section descriptors live in
// distanceColumns.ts (MACD today; VWAP / EMA join later).
export interface DistanceColumn {
  label: string
  getValue: (row: TradeWithTechnicalsRow, timeframe: Timeframe) => number
  format: (v: number) => string
}

type SortKey = 'date' | 'net_pnl' | 'distance'
type SortDir = 'asc' | 'desc'

interface BucketTradeTableProps {
  rows: TradeWithTechnicalsRow[]
  timeframe: Timeframe // which tf snapshot the distance column reads
  distanceColumn: DistanceColumn
}

const DEFAULT_VISIBLE = 8

function sortRows(
  rows: TradeWithTechnicalsRow[],
  key: SortKey,
  dir: SortDir,
  timeframe: Timeframe,
  distanceColumn: DistanceColumn,
): TradeWithTechnicalsRow[] {
  const mult = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'date') return a.date.localeCompare(b.date) * mult
    if (key === 'net_pnl') return (a.net_pnl - b.net_pnl) * mult
    return (
      (distanceColumn.getValue(a, timeframe) -
        distanceColumn.getValue(b, timeframe)) *
      mult
    )
  })
}

export default function BucketTradeTable({
  rows,
  timeframe,
  distanceColumn,
}: BucketTradeTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'date',
    dir: 'desc',
  })
  const [showAll, setShowAll] = useState(false)

  // Click the active column → flip direction; a different column → that column,
  // descending (newest / largest first, the conventional default).
  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    )

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-3 text-[11px] text-fg-tertiary">
        No trades in this bucket.
      </div>
    )
  }

  const sorted = sortRows(rows, sort.key, sort.dir, timeframe, distanceColumn)
  const visible = showAll ? sorted : sorted.slice(0, DEFAULT_VISIBLE)
  const hasMore = sorted.length > DEFAULT_VISIBLE

  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <Th label="Date" col="date" sort={sort} onSort={onSort} align="left" />
            <Th label="Net P&L" col="net_pnl" sort={sort} onSort={onSort} align="right" />
            <Th
              label={distanceColumn.label}
              col="distance"
              sort={sort}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={row.id}
              className="font-mono text-[11px] text-fg-primary transition-colors duration-150 hover:bg-bg-3"
            >
              <td className="py-1 text-left">{row.date}</td>
              <td className={`py-1 text-right ${pnlClass(row.net_pnl)}`}>
                {signed(row.net_pnl)}
              </td>
              <td className="py-1 text-right">
                {distanceColumn.format(distanceColumn.getValue(row, timeframe))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <div className="mt-2 flex items-center justify-between border-t border-border-subtle/60 pt-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
          >
            {showAll ? 'Show first 8' : `Show all ${sorted.length}`}
          </button>
          <span className="text-[10px] text-fg-muted tnum">
            (showing {visible.length} of {sorted.length})
          </span>
        </div>
      )}
    </div>
  )
}

function Th({
  label,
  col,
  sort,
  onSort,
  align,
}: {
  label: string
  col: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  align: 'left' | 'right'
}) {
  const active = sort.key === col
  return (
    <th
      scope="col"
      onClick={() => onSort(col)}
      className={`cursor-pointer select-none border-b border-border-subtle/60 pb-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-gold' : 'text-fg-tertiary hover:text-fg-primary'}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (sort.dir === 'asc' ? (
            <ChevronUp size={10} strokeWidth={2.5} className="text-gold" />
          ) : (
            <ChevronDown size={10} strokeWidth={2.5} className="text-gold" />
          ))}
      </span>
    </th>
  )
}

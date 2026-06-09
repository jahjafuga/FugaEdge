// One bucket's trade table for the MACD State accordion (5b.1). Presentational:
// a hand-rolled 3-column sortable table (Date / Net P&L / MACD line) over the
// rows rowsForBucket resolved for the open cell. Static this commit — rows are
// inert (no click / modal); the row-click → read-only detail lands in 5b.2.
//
// Sort is a thin Array.sort behind useState (stable in V8, so equal keys keep
// rowsForBucket's input order). 8 rows shown by default with a "Show all N"
// expander.

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from '@/core/technicals/headerStrip'
import { signed, pnlClass } from '@/lib/format'

type SortKey = 'date' | 'net_pnl' | 'macd_line'
type SortDir = 'asc' | 'desc'

interface BucketTradeTableProps {
  rows: TradeWithTechnicalsRow[]
  timeframe: Timeframe // which tf snapshot to read macd_line from
}

const DEFAULT_VISIBLE = 8

// macd_line on the toggled timeframe. The `!` on row.technicals is safe here:
// BucketTradeTable only ever renders rowsForBucket output, and rowsForBucket →
// classifyMacdBucket returns a non-null bucket key only when technicals is
// non-null (passed the data gate) AND macd_positive / macd_rising are non-null.
// So every row reaching this table carries a snapshot. (macd_line is typed
// number|null but is non-null whenever macd_positive is — both derive from the
// same MACD line; the `?? 0` satisfies the type and is unreachable in practice.)
function macdLineOf(row: TradeWithTechnicalsRow, timeframe: Timeframe): number {
  const snap = timeframe === '1m' ? row.technicals!.tf_1m : row.technicals!.tf_5m
  return snap.macd_line ?? 0
}

function sortRows(
  rows: TradeWithTechnicalsRow[],
  key: SortKey,
  dir: SortDir,
  timeframe: Timeframe,
): TradeWithTechnicalsRow[] {
  const mult = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'date') return a.date.localeCompare(b.date) * mult
    if (key === 'net_pnl') return (a.net_pnl - b.net_pnl) * mult
    return (macdLineOf(a, timeframe) - macdLineOf(b, timeframe)) * mult
  })
}

// Explicit + on positives — the MACD line's sign IS the positive/negative axis
// the column sorts on, so symmetry around zero should read at a glance.
function fmtMacd(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(3)}`
}

export default function BucketTradeTable({ rows, timeframe }: BucketTradeTableProps) {
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

  const sorted = sortRows(rows, sort.key, sort.dir, timeframe)
  const visible = showAll ? sorted : sorted.slice(0, DEFAULT_VISIBLE)
  const hasMore = sorted.length > DEFAULT_VISIBLE

  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <Th label="Date" col="date" sort={sort} onSort={onSort} align="left" />
            <Th label="Net P&L" col="net_pnl" sort={sort} onSort={onSort} align="right" />
            <Th label="MACD line" col="macd_line" sort={sort} onSort={onSort} align="right" />
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
              <td className="py-1 text-right">{fmtMacd(macdLineOf(row, timeframe))}</td>
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

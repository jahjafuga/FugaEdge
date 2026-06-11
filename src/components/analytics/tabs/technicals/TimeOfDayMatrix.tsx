// Time-of-Day matrix (spec §B Section 6 / §I) — the entry time-bucket by
// MACD-state cross-tab, the final Technicals section. A 5x4 table: five §I
// time-bucket rows (pre-9:30 to 12:00+) by four §G MACD-state columns. Each of the
// 20 cells is a clickable button showing n + net P&L (P&L-colored), with the §C
// low-sample badge on 0<n<5 and a rendered "0" / "$0.00" for empty cells (never
// blank). Clicking a cell drills it through the shared BucketTradeTable,
// single-open across the whole grid via a composite `${time}:${macd}` key on
// useBucketBand — one AccordionPanel beneath the table, the same interaction every
// other section has.
//
// Column headers are compact (Pos / Neg + a rising/falling arrow) with the full
// MACD label in a title tooltip (D-S6.3), so four long state names don't crowd the
// header row. Cells are neutral; the P&L color carries the read. At ~20 cells the
// grid is often sparse for a real book — honest per §C: the n-counts + low-sample
// badges tell that story.
//
// Reuses the pure timeOfDay aggregation (computeTimeOfDay + rowsForTimeOfDayCell);
// the SectionHeader is composed by TechnicalsTab.

import { useMemo } from 'react'
import type {
  TimeOfDayStats,
  TimeOfDayKey,
} from '@/core/technicals/timeOfDay'
import {
  rowsForTimeOfDayCell,
  TIME_OF_DAY_BUCKETS,
} from '@/core/technicals/timeOfDay'
import type { BucketKey } from '@/core/technicals/macdBuckets'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { signed, pnlClass } from '@/lib/format'
import BucketTradeTable from './BucketTradeTable'
import { macdLineColumn } from './distanceColumns'
import AccordionPanel from './AccordionPanel'
import LowSampleBadge from './LowSampleBadge'
import { useBucketBand } from './useBucketBand'

// The composite single-open key — one accordion across the whole grid, keyed on
// which (time, MACD) cell is open. useBucketBand drives the single-open state.
type CellKey = `${TimeOfDayKey}:${BucketKey}`

// The four MACD-state columns in §G order, with the compact arrow header and the
// full label for the title tooltip (D-S6.3). The arrows match MacdStateGrid.
const MACD_COLUMNS: readonly {
  key: BucketKey
  short: string
  full: string
}[] = [
  { key: 'posRising', short: 'Pos ▲', full: 'Positive + Rising' },
  { key: 'posFalling', short: 'Pos ▼', full: 'Positive + Falling' },
  { key: 'negRising', short: 'Neg ▲', full: 'Negative + Rising' },
  { key: 'negFalling', short: 'Neg ▼', full: 'Negative + Falling' },
]

interface TimeOfDayMatrixProps {
  stats: TimeOfDayStats
  filteredRows: TradeWithTechnicalsRow[]
  timeframe: Timeframe
}

export default function TimeOfDayMatrix({
  stats,
  filteredRows,
  timeframe,
}: TimeOfDayMatrixProps) {
  const { openBucket, displayBucket, onToggle } = useBucketBand<CellKey>()

  // Rows for the displayed cell — parse the composite key back into its (time,
  // MACD) axes and resolve through rowsForTimeOfDayCell. Derived from displayBucket
  // (not openBucket) so they persist through the close animation.
  const openRows = useMemo(() => {
    if (displayBucket === null) return []
    const [timeKey, macdKey] = displayBucket.split(':') as [
      TimeOfDayKey,
      BucketKey,
    ]
    return rowsForTimeOfDayCell(filteredRows, timeframe, timeKey, macdKey)
  }, [displayBucket, filteredRows, timeframe])

  return (
    <div className="flex flex-col">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[112px]" />
            {MACD_COLUMNS.map((c) => (
              <th
                key={c.key}
                title={c.full}
                className="pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary"
              >
                {c.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_OF_DAY_BUCKETS.map((tb) => (
            <tr key={tb.key}>
              <th
                scope="row"
                className="pr-2 text-right align-middle text-[10px] uppercase tracking-wider text-fg-tertiary"
              >
                {tb.label}
              </th>
              {MACD_COLUMNS.map((c) => {
                const cell = stats.cells[tb.key][c.key]
                const cellKey: CellKey = `${tb.key}:${c.key}`
                const isOpen = openBucket === cellKey
                return (
                  <td key={c.key} className="p-1 align-top">
                    <button
                      type="button"
                      aria-label={`${tb.label} ${c.full}`}
                      aria-expanded={isOpen}
                      onClick={() => onToggle(cellKey)}
                      className={`flex w-full cursor-pointer flex-col items-center gap-0.5 rounded border p-2 transition-colors duration-150 ${
                        isOpen
                          ? 'border-gold/60 bg-bg-3'
                          : 'border-border-subtle bg-bg-2 hover:border-gold/40'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-fg-primary tnum">
                        {cell.n}
                      </span>
                      <span
                        className={`font-mono text-[11px] tnum ${pnlClass(cell.netPnl)}`}
                      >
                        {signed(cell.netPnl)}
                      </span>
                      <LowSampleBadge n={cell.n} />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <AccordionPanel open={openBucket !== null}>
        {displayBucket !== null && (
          <BucketTradeTable
            rows={openRows}
            timeframe={timeframe}
            distanceColumn={macdLineColumn}
          />
        )}
      </AccordionPanel>
    </div>
  )
}

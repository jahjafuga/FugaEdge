import { useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'
import { money, price, int, pnlClass, signed, longDate, compactShares } from '@/lib/format'
import Flag from '@/components/ui/Flag'
import Sparkline from './Sparkline'
import TradeDetailModal from './TradeDetailModal'

interface TradesTableProps {
  trades: TradeListRow[]
  onSaveNote: (input: UpdateNoteInput) => Promise<void>
  onSaveTimeframe: (input: UpdateTimeframeInput) => Promise<void>
  onSavePlaybook: (input: SetPlaybookOnTradeInput) => Promise<void>
  onSaveConfidence: (input: UpdateConfidenceInput) => Promise<void>
  onSaveMistakes: (input: UpdateMistakesInput) => Promise<void>
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
  /** Show the Float column. Off by default to keep the table dense. */
  showFloatColumn?: boolean
  /** Show the Country column. Defaults to true. */
  showCountryColumn?: boolean
}

// MASTER §5.3 + §7.2 — data-dense, virtualized table. Row click opens the
// portal TradeDetailModal (replaces the previous in-row accordion which made
// rows tall/cluttered). Sorting via @tanstack/react-table; visible rows via
// @tanstack/react-virtual.
//
// Row height locked at 40px so the virtualizer has a stable estimateSize and
// the sticky header math stays correct.
const ROW_HEIGHT = 40

const col = createColumnHelper<TradeListRow>()

const COLUMN_WIDTHS = {
  date: 110,
  open: 80,
  close: 80,
  symbol: 80,
  playbook: 130,
  side: 60,
  shares_bought: 80,
  avg_buy: 90,
  shares_sold: 80,
  avg_sell: 90,
  fees: 80,
  net_pnl: 110,
  float: 70,
  spark: 1,
} as const

export default function TradesTable({
  trades,
  onSaveNote,
  onSaveTimeframe,
  onSavePlaybook,
  onSaveConfidence,
  onSaveMistakes,
  onSavePlannedRisk,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
  showFloatColumn = false,
  showCountryColumn = true,
}: TradesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'open_time', desc: true },
  ])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const columns = useMemo(() => {
    const countryColumn = col.accessor('country', {
      id: 'country',
      header: 'Country',
      size: 80,
      cell: (info) => {
        const iso = info.getValue()
        if (!iso) return <span className="font-mono text-[10px] text-fg-muted">—</span>
        return (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-fg-primary">
            <Flag iso={iso} className="text-base leading-none" />
            <span>{iso}</span>
          </span>
        )
      },
      sortingFn: (a, b) => {
        const av = a.original.country
        const bv = b.original.country
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return av.localeCompare(bv)
      },
    })
    const floatColumn = col.accessor('float_shares', {
      id: 'float',
      header: () => <span className="block text-right">Float</span>,
      size: COLUMN_WIDTHS.float,
      cell: (info) => (
        <div className="text-right font-mono text-fg-secondary tnum">
          {compactShares(info.getValue())}
        </div>
      ),
    })
    const base = [
      col.accessor('open_time', {
        id: 'open_time',
        header: 'Date',
        size: COLUMN_WIDTHS.date,
        cell: (info) => (
          <span className="whitespace-nowrap font-mono text-xs text-fg-secondary tnum">
            {longDate(info.row.original.date)}
          </span>
        ),
        sortingFn: 'alphanumeric',
      }),
      col.accessor('open_time', {
        id: 'open',
        header: 'Open',
        size: COLUMN_WIDTHS.open,
        cell: (info) => (
          <span className="whitespace-nowrap font-mono text-xs text-fg-primary tnum">
            {timeOf(info.getValue() as string)}
          </span>
        ),
        sortingFn: 'alphanumeric',
      }),
      col.accessor((r) => r.close_time ?? '', {
        id: 'close',
        header: 'Close',
        size: COLUMN_WIDTHS.close,
        cell: (info) => {
          const t = info.row.original
          if (!t.close_time) {
            return (
              <span className="rounded-sm bg-loss-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-loss">
                open
              </span>
            )
          }
          return (
            <span className="whitespace-nowrap font-mono text-xs text-fg-primary tnum">
              {timeOf(t.close_time)}
            </span>
          )
        },
        sortingFn: 'alphanumeric',
      }),
      col.accessor('symbol', {
        id: 'symbol',
        header: 'Symbol',
        size: COLUMN_WIDTHS.symbol,
        cell: (info) => (
          <span className="font-mono font-semibold text-fg-primary">
            {info.getValue()}
          </span>
        ),
      }),
      col.accessor((r) => r.playbook_name ?? '', {
        id: 'playbook',
        header: 'Playbook',
        size: COLUMN_WIDTHS.playbook,
        cell: ({ row }) => {
          const name = row.original.playbook_name
          if (!name) return <span className="font-mono text-[10px] text-fg-muted">—</span>
          return (
            <span className="inline-block max-w-full truncate rounded-sm bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gold">
              {name}
            </span>
          )
        },
      }),
      col.accessor('side', {
        id: 'side',
        header: 'Side',
        size: COLUMN_WIDTHS.side,
        cell: (info) => {
          const side = info.getValue()
          return (
            <span
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                side === 'short' ? 'bg-loss-soft text-loss' : 'bg-win-soft text-win'
              }`}
            >
              {side}
            </span>
          )
        },
      }),
      col.accessor('shares_bought', {
        id: 'shares_bought',
        header: () => <span className="block text-right">Bought</span>,
        size: COLUMN_WIDTHS.shares_bought,
        cell: (info) => (
          <div className="text-right font-mono text-fg-primary tnum">
            {int(info.getValue())}
          </div>
        ),
      }),
      col.accessor('avg_buy_price', {
        id: 'avg_buy',
        header: () => <span className="block text-right">Buy avg</span>,
        size: COLUMN_WIDTHS.avg_buy,
        cell: (info) => (
          <div className="text-right font-mono text-fg-secondary tnum">
            {price(info.getValue())}
          </div>
        ),
      }),
      col.accessor('shares_sold', {
        id: 'shares_sold',
        header: () => <span className="block text-right">Sold</span>,
        size: COLUMN_WIDTHS.shares_sold,
        cell: (info) => (
          <div className="text-right font-mono text-fg-primary tnum">
            {int(info.getValue())}
          </div>
        ),
      }),
      col.accessor('avg_sell_price', {
        id: 'avg_sell',
        header: () => <span className="block text-right">Sell avg</span>,
        size: COLUMN_WIDTHS.avg_sell,
        cell: (info) => (
          <div className="text-right font-mono text-fg-secondary tnum">
            {price(info.getValue())}
          </div>
        ),
      }),
      col.accessor('total_fees', {
        id: 'fees',
        header: () => <span className="block text-right">Fees</span>,
        size: COLUMN_WIDTHS.fees,
        cell: (info) => (
          <div className="text-right font-mono text-fg-tertiary tnum">
            {money(info.getValue())}
          </div>
        ),
      }),
      col.accessor('net_pnl', {
        id: 'net_pnl',
        header: () => <span className="block text-right">Net P&L</span>,
        size: COLUMN_WIDTHS.net_pnl,
        cell: (info) => {
          const v = info.getValue()
          return (
            <div className={`text-right font-mono font-semibold tnum ${pnlClass(v)}`}>
              {signed(v)}
            </div>
          )
        },
      }),
      col.display({
        id: 'spark',
        header: '',
        size: COLUMN_WIDTHS.spark,
        cell: ({ row }) => (
          <Sparkline
            executions={row.original.executions}
            netPnl={row.original.net_pnl}
          />
        ),
      }),
    ]
    // Insert the Float column just before the Net P&L column so it sits
    // alongside the trade-quality fields rather than at the row's edge.
    if (showFloatColumn) {
      const netPnlIdx = base.findIndex((c) => c.id === 'net_pnl')
      if (netPnlIdx > -1) base.splice(netPnlIdx, 0, floatColumn)
      else base.push(floatColumn)
    }
    if (showCountryColumn) {
      const playbookIdx = base.findIndex((c) => c.id === 'playbook')
      const insertAt = playbookIdx >= 0 ? playbookIdx + 1 : 5
      base.splice(insertAt, 0, countryColumn)
    }
    return base
  }, [showFloatColumn, showCountryColumn])

  const table = useReactTable({
    data: trades,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const sortedRows = table.getRowModel().rows
  const containerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  const items = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = items[0]?.start ?? 0
  const paddingBottom =
    items.length > 0 ? totalSize - (items[items.length - 1].end ?? 0) : 0

  const selectedTrade =
    selectedId === null ? null : trades.find((t) => t.id === selectedId) ?? null

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-2 shadow-sm">
      {/* Scroll container is on the OUTER wrapper, with a fixed height — the
          virtualizer reads scrollTop from this element. */}
      <div ref={containerRef} className="max-h-[calc(100vh-280px)] overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10 bg-bg-header">
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-border-subtle font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary"
              >
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const canSort = h.column.getCanSort()
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      style={{ width: h.getSize() }}
                      className={`px-3 py-2.5 font-semibold ${
                        canSort ? 'cursor-pointer select-none transition-colors duration-150 hover:text-fg-primary' : ''
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' && (
                          <ChevronUp size={10} strokeWidth={2.5} className="text-gold" />
                        )}
                        {sorted === 'desc' && (
                          <ChevronDown size={10} strokeWidth={2.5} className="text-gold" />
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr style={{ height: paddingTop }}>
                <td colSpan={columns.length} />
              </tr>
            )}
            {items.map((vi) => {
              const row = sortedRows[vi.index]
              if (!row) return null
              const t = row.original
              const tint =
                t.net_pnl > 0
                  ? 'hover:bg-bg-3'
                  : t.net_pnl < 0
                    ? 'hover:bg-bg-3'
                    : 'hover:bg-bg-3'
              return (
                <tr
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{ height: ROW_HEIGHT }}
                  className={`cursor-pointer border-b border-border-subtle/60 transition-colors duration-150 ease-out-soft ${tint}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-3 align-middle"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={columns.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TradeDetailModal
        trade={selectedTrade}
        onClose={() => setSelectedId(null)}
        onSaveNote={onSaveNote}
        onSaveTimeframe={onSaveTimeframe}
        onSavePlaybook={onSavePlaybook}
        onSaveConfidence={onSaveConfidence}
        onSaveMistakes={onSaveMistakes}
        onSavePlannedRisk={onSavePlannedRisk}
        onSavePlannedStopLoss={onSavePlannedStopLoss}
        onSaveFloat={onSaveFloat}
        onSaveCatalyst={onSaveCatalyst}
        onSaveCountry={onSaveCountry}
      />
    </div>
  )
}

function timeOf(iso: string): string {
  const t = iso.split('T')[1]
  return t ?? iso
}

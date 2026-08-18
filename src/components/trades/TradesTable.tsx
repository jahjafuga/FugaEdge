import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { computeExecutionStats } from '@/core/trades/executionStats'
import { holdTimeSeconds, pnlGainPct } from '@/core/trades/tradeMetrics'
import {
  UNHIDEABLE_COLUMN,
  readColumnVisibility,
  resetColumnVisibility,
  writeColumnVisibility,
} from '@/lib/prefs/columns'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'
import { money, price, int, pnlClass, signed, signedPct, duration, longDate, compactShares, formatEastern } from '@/lib/format'
import { getTradeNavPosition } from '@/core/trades/tradeNavigation'
import { tierRank } from '@/core/playbook/tierRank'
import Flag from '@/components/ui/Flag'
import TierBadge from '@/components/playbook/TierBadge'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Sparkline from './Sparkline'
import TradeDetailModal from './TradeDetailModal'
import TradesBulkActionBar from './TradesBulkActionBar'
import BulkSetPlaybookModal from './BulkSetPlaybookModal'
import BulkSetCatalystModal from './BulkSetCatalystModal'
import BulkSetMistakesModal from './BulkSetMistakesModal'

interface TradesTableProps {
  trades: TradeListRow[]
  /** Multi-account slice — resolves a row's owning account (name + color)
   *  UNDER SCOPE 'all' only; null hides the indicator (single-account lists
   *  are homogeneous). Provided by the Trades page from the scope context. */
  accountFor?: (t: TradeListRow) => { name: string; color: string | null } | null
  onSaveNote: (input: UpdateNoteInput) => Promise<void>
  onSaveTimeframe: (input: UpdateTimeframeInput) => Promise<void>
  onSavePlaybook: (input: SetPlaybookOnTradeInput) => Promise<void>
  onSaveConfidence: (input: UpdateConfidenceInput) => Promise<void>
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
  onSaveCountrySymbol?: (input: UpdateCountryForSymbolInput) => Promise<void>
  /** Symptom B — forwarded to the row's TradeDetailModal mistakes picker so a
   *  tag write patches the row in the parent's `trades` with no remount. */
  onMistakesChange?: (updated: TradeListRow) => void
  /** v0.2.3 soft-delete lifecycle — threaded into the row's TradeDetailModal. */
  onSoftDelete?: (trade_id: number) => Promise<void>
  onRestore?: (trade_id: number) => Promise<void>
  /** v0.2.3 Phase 4 — bulk soft-delete. When provided, the table renders a
   *  leading selection checkbox column + a bottom action bar. Absent on the
   *  calendar/review hosts, so those render no selection UI. */
  onBulkSoftDelete?: (ids: number[]) => Promise<void>
  /** Phase 2 — bulk set the primary playbook on the selected trades. The host
   *  applies the write and patches the returned rows. */
  onBulkSetPlaybook?: (ids: number[], playbookId: number | null) => Promise<void>
  /** Phase 2 — bulk set the catalyst on the selected trades (catalyst_type only;
   *  each trade keeps its own days-since). */
  onBulkSetCatalyst?: (ids: number[], catalystType: string | null) => Promise<void>
  /** Phase 2 — bulk add/remove mistakes (by mistake_def_id) on the selected
   *  trades. Add unions; Remove strips. No replace-all. */
  onBulkSetMistakes?: (
    ids: number[],
    mode: 'add' | 'remove',
    mistakeDefIds: number[],
  ) => Promise<void>
}

// MASTER §5.3 + §7.2 — data-dense, virtualized table. Row click opens the
// portal TradeDetailModal (replaces the previous in-row accordion which made
// rows tall/cluttered). Sorting via @tanstack/react-table; visible rows via
// @tanstack/react-virtual.
//
// Row height locked at 40px so the virtualizer has a stable estimateSize and
// the sticky header math stays correct.
const ROW_HEIGHT = 40

// v0.2.3 Phase 4 — UX cap on a single bulk selection. Deliberately well below
// SQLite's actual bind limit (32766 in better-sqlite3 11.x / SQLite 3.49); this
// is a usability ceiling, not a technical one, so the `WHERE id IN (...)` op
// never needs chunking.
const MAX_BULK = 500

const col = createColumnHelper<TradeListRow>()

// A row's mistake count — the Mistakes column's sort key (and its accessor).
// `mistakes` is typed required and every production read populates it, but the
// cell already guards `!m` defensively; this does too, so a malformed row sorts
// as 0 rather than throwing mid-comparison.
const mistakeCount = (t: TradeListRow): number => t.mistakes?.length ?? 0

const COLUMN_WIDTHS = {
  date: 110,
  open: 80,
  close: 80,
  symbol: 80,
  playbook: 130,
  side: 60,
  shares: 80,
  avg_buy: 90,
  avg_sell: 90,
  fees: 80,
  net_pnl: 110,
  float: 70,
  catalyst: 130,
  mistakes: 150,
  spark: 1,
} as const

// Memoized table row (PERF Beat 2). The table is virtualized and re-renders on
// every scroll; without memo, each visible row's standard cells re-rendered every
// frame. All props are shallow-stable ON SCROLL: `row` (TanStack's memoized row
// model), `isSelected` (a boolean, NOT the Set), `bulkEnabled`/`index` (stable),
// `onSelect` (a stable setter), `onToggle` (a useCallback'd handler that does not
// change while scrolling) — so memo skips untouched rows during scroll. (Scope:
// the scroll win only. Selection-time still re-renders all rows this beat, since
// onToggle's ref changes when lastClickedIndex updates — a separate optimization.)
const TradesTableRow = memo(function TradesTableRow({
  row,
  isSelected,
  bulkEnabled,
  index,
  onSelect,
  onToggle,
}: {
  row: Row<TradeListRow>
  isSelected: boolean
  bulkEnabled: boolean
  index: number
  onSelect: (id: number) => void
  onToggle: (id: number, index: number, shiftKey: boolean) => void
  // Memo-busting signal ONLY (intentionally not destructured/rendered): React.memo
  // shallow-compares the whole props object, so a change here re-renders the row.
  // A column toggle (Float / Country / Sparkline) changes columns.length but NONE
  // of the other props (the row model is memoized on data/sorting, not columns), so
  // without this the memoized row would render stale cells one column behind the
  // header (the 201aa2b misalignment). Stable on scroll — columns.length is
  // unchanged while scrolling — so Beat 2's skip-rows-on-scroll win is preserved.
  columnCount: number
}) {
  const t = row.original
  return (
    <tr
      onClick={() => onSelect(t.id)}
      style={{ height: ROW_HEIGHT }}
      className="cursor-pointer border-b border-border-subtle/60 transition-colors duration-150 ease-out-soft hover:bg-bg-3"
    >
      {bulkEnabled && (
        <td
          style={{ width: 36 }}
          className="group cursor-pointer px-3 text-center align-middle transition-colors duration-150 hover:bg-gold/10"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            aria-label={`Select ${t.symbol} ${longDate(t.date)}`}
            checked={isSelected}
            onChange={() => {}}
            onClick={(e) => {
              // stop the row's onClick (which opens the modal) and
              // read shiftKey for range select.
              e.stopPropagation()
              onToggle(t.id, index, e.shiftKey)
            }}
            className="h-3.5 w-3.5 cursor-pointer rounded-[3px] accent-gold transition-shadow group-hover:ring-2 group-hover:ring-gold/50"
          />
        </td>
      )}
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
})

/** The em dash every optional column shows when its source is null. A zero here
 *  would claim a measurement nobody took. */
const EMPTY = '—'

/** Right-aligned monospace cell, shared by all fifteen optional columns so their
 *  formatting cannot drift apart one column at a time. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-right font-mono text-xs text-fg-secondary tnum">{children}</div>
  )
}

export default function TradesTable({
  trades,
  accountFor,
  onSaveNote,
  onSaveTimeframe,
  onSavePlaybook,
  onSaveConfidence,
  onSavePlannedRisk,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
  onSaveCountrySymbol,
  onMistakesChange,
  onSoftDelete,
  onRestore,
  onBulkSoftDelete,
  onBulkSetPlaybook,
  onBulkSetCatalyst,
  onBulkSetMistakes,
}: TradesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'open_time', desc: true },
  ])
  // v0.2.7 — column visibility. TanStack owns the state; src/lib/prefs/columns.ts
  // owns persistence and pins `symbol` visible. One mechanism, replacing the four
  // localStorage keys + five boolean props this used to be spread across.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => readColumnVisibility(),
  )
  useEffect(() => {
    writeColumnVisibility(columnVisibility as Record<string, boolean>)
  }, [columnVisibility])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // v0.2.3 Phase 4 — bulk selection. Greenfield (no prior multi-select in the
  // app); mirrors PreviewTable's Set<number> idiom. State lives here so it
  // survives sort + scroll; the parent owns only the bulk IPC handler.
  const bulkEnabled = onBulkSoftDelete != null
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  // Retag (set-playbook) keeps its OWN busy/error so a retag failure never muddles
  // the delete confirm's state, and vice versa.
  const [bulkSetPlaybookOpen, setBulkSetPlaybookOpen] = useState(false)
  // Catalyst shares bulkRetagBusy/bulkRetagError — only one retag modal opens at a
  // time, so the busy/error can't collide; just its own open flag.
  const [bulkSetCatalystOpen, setBulkSetCatalystOpen] = useState(false)
  // Mistakes shares the same bulkRetagBusy/bulkRetagError as playbook/catalyst —
  // only one retag modal opens at a time; just its own open flag.
  const [bulkSetMistakesOpen, setBulkSetMistakesOpen] = useState(false)
  const [bulkRetagBusy, setBulkRetagBusy] = useState(false)
  const [bulkRetagError, setBulkRetagError] = useState<string | null>(null)

  const columns = useMemo(() => {
    const countryColumn = col.accessor('country', {
      id: 'country',
      header: 'Country',
      // v0.1.4 — ISO code text removed from the cell. Flag-only render
      // means the column can shrink ~30px; tooltip carries the country
      // name on hover.
      size: 64,
      minSize: 56,
      cell: ({ row }) => {
        const iso = row.original.country
        const name = row.original.country_name
        if (!iso) {
          return <span className="font-mono text-[10px] text-fg-muted">—</span>
        }
        return (
          <span
            className="inline-flex items-center justify-center"
            title={name || iso}
          >
            <Flag iso={iso} size={28} title={name || iso} />
          </span>
        )
      },
      // Sort by human-readable country name (alphabetical) and push rows
      // with no country to the bottom regardless of direction.
      sortingFn: (a, b) => {
        const av = a.original.country
        const bv = b.original.country
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return a.original.country_name.localeCompare(b.original.country_name)
      },
    })
    const floatColumn = col.accessor('float_shares', {
      id: 'float',
      // v0.2.2 Commit B — column accessor stays on `float_shares` (Commit B
      // now populates it with REAL FMP float, not shares-outstanding).
      // Lao decision: rename-only, no second Shares Out column. Shares Out
      // lives in the modal as a reference field.
      header: () => <span className="block text-right">Float</span>,
      size: COLUMN_WIDTHS.float,
      cell: (info) => (
        <div className="text-right font-mono text-fg-secondary tnum">
          {compactShares(info.getValue())}
        </div>
      ),
    })
    const catalystColumn = col.accessor('catalyst_type', {
      id: 'catalyst',
      header: 'Catalyst',
      size: COLUMN_WIDTHS.catalyst,
      // Alpha sort, nulls last — clones the Country column's null-aware comparator.
      sortingFn: (a, b) => {
        const av = a.original.catalyst_type
        const bv = b.original.catalyst_type
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return av.localeCompare(bv)
      },
      cell: (info) => {
        const v = info.getValue()
        if (v == null || v === '')
          return <span className="font-mono text-[10px] text-fg-muted">—</span>
        return (
          <span className="block truncate text-sm text-fg-secondary" title={v}>
            {v}
          </span>
        )
      },
    })
    // Mistakes — "first + +N more". The array is ordered by axis/sort_position in
    // the SQL, so m[0] is a stable first. Empty renders an em-dash (no-fabrication
    // rule — never "0 mistakes").
    //
    // Sorts by mistake COUNT, mirroring the Playbook column's derived-key pattern
    // below (`(a, b) => tierRank(a.original) - tierRank(b.original)`): the sort key
    // is computed from the row, not read off the cell's value.
    //
    // It must be an ACCESSOR column, not `col.display` — TanStack's getCanSort()
    // ANDs `!!column.accessorFn`, so a display column can never sort no matter what
    // enableSorting says. Accessing the count (a number, not a string) also makes
    // the first click DESCENDING via getAutoSortDir — same as the numeric siblings
    // (Net P&L, Bought, …) — so the most-mistakes trades surface first.
    const mistakesColumn = col.accessor(mistakeCount, {
      id: 'mistakes',
      header: 'Mistakes',
      size: COLUMN_WIDTHS.mistakes,
      sortingFn: (a, b) => mistakeCount(a.original) - mistakeCount(b.original),
      cell: ({ row }) => {
        const m = row.original.mistakes
        if (!m || m.length === 0)
          return <span className="font-mono text-[10px] text-fg-muted">—</span>
        return (
          <span
            className="inline-flex max-w-full items-baseline gap-1"
            title={m.join(', ')}
          >
            <span className="truncate text-sm text-fg-secondary">{m[0]}</span>
            {m.length > 1 && (
              <span className="shrink-0 text-[10px] font-medium text-fg-muted">
                +{m.length - 1}
              </span>
            )}
          </span>
        )
      },
    })
    const sparkColumn = col.display({
      id: 'spark',
      header: '',
      size: COLUMN_WIDTHS.spark,
      cell: ({ row }) => (
        <Sparkline
          executions={row.original.executions}
          netPnl={row.original.net_pnl}
        />
      ),
    })
    const base: ColumnDef<TradeListRow, any>[] = [
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
            {formatEastern(info.getValue() as string)}
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
              <span className="rounded-sm bg-loss-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-loss">
                open
              </span>
            )
          }
          return (
            <span className="whitespace-nowrap font-mono text-xs text-fg-primary tnum">
              {formatEastern(t.close_time)}
            </span>
          )
        },
        sortingFn: 'alphanumeric',
      }),
      col.accessor('symbol', {
        id: 'symbol',
        header: 'Symbol',
        // Unhideable: without it the rows cannot be told apart. Enforced here AND in
        // the prefs module, so neither a UI path nor a hand-edited store can lose it.
        enableHiding: false,
        size: COLUMN_WIDTHS.symbol,
        cell: (info) => {
          // Under 'all' the row carries its owning-account dot (tooltip =
          // the account name) — the lightest treatment the cell affords.
          const owner = accountFor?.(info.row.original) ?? null
          return (
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-fg-primary">
              {info.getValue()}
              {owner && (
                <span
                  title={owner.name}
                  aria-label={`Account: ${owner.name}`}
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: owner.color ?? 'var(--fg-muted, #8a8a8a)' }}
                />
              )}
            </span>
          )
        },
      }),
      col.accessor((r) => r.playbook_name ?? '', {
        id: 'playbook',
        header: 'Playbook',
        size: COLUMN_WIDTHS.playbook,
        // Brendan's tier-rank sort (worst-to-best, untagged last) — replaces the
        // default alphabetical-by-name. Ranking lives in the pure tierRank helper;
        // ascending first-click gives No Setup -> C -> B -> A -> A+ -> Untagged.
        sortingFn: (a, b) => tierRank(a.original) - tierRank(b.original),
        cell: ({ row }) => {
          const name = row.original.playbook_name
          const tier = row.original.playbook_tier
          if (!name) return <span className="font-mono text-[10px] text-fg-muted">—</span>
          return (
            <span className="inline-flex max-w-full items-center gap-1.5">
              {tier && <TierBadge tier={tier} />}
              <span className="truncate rounded-sm bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                {name}
              </span>
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
              className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                side === 'short' ? 'bg-loss-soft text-loss' : 'bg-win-soft text-win'
              }`}
            >
              {side}
            </span>
          )
        },
      }),
      // Dave #15 — ONE SHARES SEMANTIC: the BOUGHT/SOLD quantity pair
      // collapses to position size = Math.max(shares_bought, shares_sold),
      // the metrics layer's pinned convention (metrics.ts positionShares,
      // avgShareSize's "established convention"). Replaces the day-tab's
      // bought+sold rendering — the double-count bug this beat fixes. The
      // removed pair stays one hover away via the cell title; on an
      // unbalanced (partial/open) trip the max IS the position.
      col.accessor((r) => Math.max(r.shares_bought, r.shares_sold), {
        id: 'shares',
        header: () => <span className="block text-right">Shares</span>,
        size: COLUMN_WIDTHS.shares,
        cell: (info) => {
          const t = info.row.original
          return (
            <div
              className="text-right font-mono text-fg-primary tnum"
              title={`Bought ${int(t.shares_bought)} · Sold ${int(t.shares_sold)}`}
            >
              {int(info.getValue() as number)}
            </div>
          )
        },
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
    ]
    // v0.2.7: the registry is FIXED. Every column is always defined, in one order,
    // and TanStack's columnVisibility decides what renders. The old build spliced
    // columns in and out by findIndex against five boolean props — so the array's
    // SHAPE changed with the toggles, and the props were a second source of truth
    // beside the table's own state. A fixed registry cannot disagree with itself.
    const netIdx = base.findIndex((c) => c.id === 'net_pnl')
    base.splice(netIdx, 0, floatColumn)
    const playbookIdx = base.findIndex((c) => c.id === 'playbook')
    base.splice(playbookIdx + 1, 0, countryColumn, catalystColumn, mistakesColumn)
    base.push(sparkColumn)

    // v0.2.7 — the fifteen optional columns, all default hidden. Values are either
    // DELIVERED on the row or computed by a core module; nothing is derived here.
    //
    // MEMOISATION: computeExecutionStats walks a trade's fills, so calling it inside
    // three separate cell renderers would walk them three times per row, on every
    // render and every sort. One WeakMap keyed by the row object collapses that to
    // once per trade for the lifetime of that object, and lets the entry drop when
    // the row does. A plain Map would pin every trade the table had ever seen.
    const execCache = new WeakMap<TradeListRow, ReturnType<typeof computeExecutionStats>>()
    const execOf = (t: TradeListRow) => {
      let v = execCache.get(t)
      if (!v) {
        v = computeExecutionStats(t)
        execCache.set(t, v)
      }
      return v
    }
    const num = (v: number | null | undefined, render: (n: number) => string) =>
      v == null || !Number.isFinite(v) ? EMPTY : render(v)

    const optional: ColumnDef<TradeListRow, any>[] = [
      col.accessor((r) => holdTimeSeconds(r), {
        id: 'hold_time', header: 'Hold', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => duration(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor((r) => execOf(r).priceMovePct, {
        id: 'price_move_pct', header: 'Move %', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => signedPct(n, 2))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor((r) => pnlGainPct(r), {
        id: 'pnl_gain_pct', header: 'Gain %', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => signedPct(n, 2))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor((r) => r.executions.length, {
        id: 'exec_count', header: 'Fills', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{int(i.getValue() as number)}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor((r) => execOf(r).firstEntry?.price ?? null, {
        id: 'first_entry', header: '1st entry', size: COLUMN_WIDTHS.avg_buy,
        cell: (i) => <Num>{num(i.getValue(), (n) => price(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('planned_stop_loss_price', {
        id: 'stop_price', header: 'Stop', size: COLUMN_WIDTHS.avg_buy,
        cell: (i) => <Num>{num(i.getValue(), (n) => price(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('r_multiple', {
        id: 'r_multiple', header: 'R', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => `${n.toFixed(2)}R`)}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('risk_per_share', {
        id: 'risk_per_share', header: 'Risk/sh', size: COLUMN_WIDTHS.avg_buy,
        cell: (i) => <Num>{num(i.getValue(), (n) => price(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('total_risk', {
        id: 'total_risk', header: 'Risk $', size: COLUMN_WIDTHS.fees,
        cell: (i) => <Num>{num(i.getValue(), (n) => money(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('rvol', {
        id: 'rvol', header: 'RVOL', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => `${n.toFixed(2)}x`)}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('daily_change_pct', {
        id: 'daily_change_pct', header: 'Day %', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => signedPct(n, 2))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('confidence', {
        id: 'confidence', header: 'Conf', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => String(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('entry_timeframe', {
        id: 'entry_timeframe', header: 'TF', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{(i.getValue() as string | null) ?? EMPTY}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('days_since_catalyst', {
        id: 'days_since_catalyst', header: 'Days since', size: COLUMN_WIDTHS.shares,
        cell: (i) => <Num>{num(i.getValue(), (n) => int(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('mae', {
        id: 'mae', header: 'MAE', size: COLUMN_WIDTHS.fees,
        cell: (i) => <Num>{num(i.getValue(), (n) => money(n))}</Num>,
        sortUndefined: 'last',
      }),
      col.accessor('mfe', {
        id: 'mfe', header: 'MFE', size: COLUMN_WIDTHS.fees,
        cell: (i) => <Num>{num(i.getValue(), (n) => money(n))}</Num>,
        sortUndefined: 'last',
      }),
    ]
    base.push(...optional)
    return base
  }, [accountFor])

  const table = useReactTable({
    data: trades,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const sortedRows = table.getRowModel().rows
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
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

  // Trade navigation (prev/next + N-of-M) over the DISPLAYED sorted order, so it
  // matches what the user sees. orderedIds re-derives on a sort/data change; the
  // pure helper (src/core) does the indexOf math. onNavigate = setSelectedId: the
  // neighbor id becomes the open trade, selectedTrade re-derives, the modal swaps.
  const orderedIds = useMemo(() => sortedRows.map((r) => r.original.id), [sortedRows])
  const navPosition = useMemo(
    () => getTradeNavPosition(orderedIds, selectedId),
    [orderedIds, selectedId],
  )

  // --- v0.2.3 Phase 4 bulk selection ------------------------------------
  // Effective selection = the chosen ids intersected with what's currently
  // visible. Everything user-facing (count, total, action payload) reads this.
  const selectedTrades = useMemo(
    () => (bulkEnabled ? trades.filter((t) => selectedIds.has(t.id)) : []),
    [bulkEnabled, trades, selectedIds],
  )
  const selectedCount = selectedTrades.length
  const bulkNetPnl = useMemo(
    () => selectedTrades.reduce((sum, t) => sum + t.net_pnl, 0),
    [selectedTrades],
  )
  const selectableMax = Math.min(trades.length, MAX_BULK)
  const allSelected = selectedCount > 0 && selectedCount >= selectableMax
  const someSelected = selectedCount > 0 && !allSelected
  const atCap = selectedCount >= MAX_BULK

  const bulkSymbolSummary = useMemo(() => {
    if (selectedTrades.length === 0) return ''
    const distinct = Array.from(new Set(selectedTrades.map((t) => t.symbol)))
    // ≤3 trades: just list the distinct symbols. Otherwise show the first 3
    // DISTINCT symbols + how many more trades, across how many symbols.
    if (selectedTrades.length <= 3) return distinct.join(', ')
    const head = distinct.slice(0, 3).join(', ')
    const moreTrades = selectedTrades.length - 3
    return `${head} and ${moreTrades} more trade${moreTrades === 1 ? '' : 's'} across ${distinct.length} symbol${distinct.length === 1 ? '' : 's'}`
  }, [selectedTrades])

  // Intersection guard (Q6): when the visible/filtered set changes, drop any
  // selected id that's no longer shown. Load-bearing — without it a bulk
  // "Move to Trash" could soft-delete rows the user can't see because a filter
  // is hiding them.
  useEffect(() => {
    if (!bulkEnabled) return
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(trades.map((t) => t.id))
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (visible.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [bulkEnabled, trades])

  // Escape clears the selection — but only when nothing else owns Escape.
  // Ordering (Q7): a stacked modal (the bulk confirm OR the detail modal) gets
  // Escape first to close itself; we must NOT also clear the selection in that
  // case. Same discipline as the P3 Esc-stacking note.
  useEffect(() => {
    if (!bulkEnabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (bulkConfirmOpen || selectedId !== null) return
      setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
      setLastClickedIndex(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [bulkEnabled, bulkConfirmOpen, selectedId])

  const toggleRow = useCallback((id: number, index: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIndex !== null) {
        // Range select walks the SORTED rows (not the DOM — most rows are
        // virtualized away), capping at MAX_BULK.
        const lo = Math.min(lastClickedIndex, index)
        const hi = Math.max(lastClickedIndex, index)
        for (let i = lo; i <= hi && next.size < MAX_BULK; i++) {
          const rid = sortedRows[i]?.original.id
          if (rid != null) next.add(rid)
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_BULK) {
        next.add(id)
      }
      // else: at cap — single add ignored; the bar shows the persistent note.
      return next
    })
    setLastClickedIndex(index)
  }, [lastClickedIndex, sortedRows])

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (prev.size >= selectableMax) return new Set()
      const next = new Set<number>()
      for (const t of trades) {
        if (next.size >= MAX_BULK) break
        next.add(t.id)
      }
      return next
    })
    setLastClickedIndex(null)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setLastClickedIndex(null)
    setBulkError(null)
  }

  const handleBulkSoftDelete = async () => {
    if (!onBulkSoftDelete || bulkBusy) return
    const ids = selectedTrades.map((t) => t.id)
    if (ids.length === 0) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      await onBulkSoftDelete(ids)
      // Success: the host filters these rows out of `trades`; clear local state.
      setSelectedIds(new Set())
      setLastClickedIndex(null)
      setBulkConfirmOpen(false)
    } catch (e) {
      // Atomic op (Q5): the whole batch rolled back. Keep the selection so the
      // user can retry; surface the error on the (persistent) action bar.
      setBulkConfirmOpen(false)
      setBulkError(
        e instanceof Error ? e.message : 'Failed to move trades to Trash.',
      )
    } finally {
      setBulkBusy(false)
    }
  }

  // Mirrors handleBulkSoftDelete's busy/error/clear pattern, but on success the
  // host PATCHES the returned rows (the trades stay in the list with new playbook
  // fields) rather than filtering them out.
  const handleBulkSetPlaybook = async (playbookId: number | null) => {
    if (!onBulkSetPlaybook || bulkRetagBusy) return
    const ids = selectedTrades.map((t) => t.id)
    if (ids.length === 0) return
    setBulkRetagBusy(true)
    setBulkRetagError(null)
    try {
      await onBulkSetPlaybook(ids, playbookId)
      setSelectedIds(new Set())
      setLastClickedIndex(null)
      setBulkSetPlaybookOpen(false)
    } catch (e) {
      setBulkRetagError(e instanceof Error ? e.message : 'Failed to set playbook.')
    } finally {
      setBulkRetagBusy(false)
    }
  }

  const handleBulkSetCatalyst = async (catalystType: string | null) => {
    if (!onBulkSetCatalyst || bulkRetagBusy) return
    const ids = selectedTrades.map((t) => t.id)
    if (ids.length === 0) return
    setBulkRetagBusy(true)
    setBulkRetagError(null)
    try {
      await onBulkSetCatalyst(ids, catalystType)
      setSelectedIds(new Set())
      setLastClickedIndex(null)
      setBulkSetCatalystOpen(false)
    } catch (e) {
      setBulkRetagError(e instanceof Error ? e.message : 'Failed to set catalyst.')
    } finally {
      setBulkRetagBusy(false)
    }
  }

  const handleBulkSetMistakes = async (
    mode: 'add' | 'remove',
    mistakeDefIds: number[],
  ) => {
    if (!onBulkSetMistakes || bulkRetagBusy) return
    const ids = selectedTrades.map((t) => t.id)
    if (ids.length === 0) return
    setBulkRetagBusy(true)
    setBulkRetagError(null)
    try {
      await onBulkSetMistakes(ids, mode, mistakeDefIds)
      setSelectedIds(new Set())
      setLastClickedIndex(null)
      setBulkSetMistakesOpen(false)
    } catch (e) {
      setBulkRetagError(e instanceof Error ? e.message : 'Failed to update mistakes.')
    } finally {
      setBulkRetagBusy(false)
    }
  }
  const colCount = columns.length + (bulkEnabled ? 1 : 0)

  return (
    <div className="card-premium card-glow-gold flex max-h-[calc(100vh-340px)] flex-col overflow-hidden">
      {/* Card is a flex column capped at the viewport: the scroll container
          flexes to fill, and the bulk action bar (below) lands at the card
          bottom instead of being pushed off-screen. min-h-0 is load-bearing —
          a flex child won't shrink below its content height without it, which
          would break the inner scroll AND push the bar off-screen again. Do
          not remove it. The virtualizer still reads scrollTop from this el. */}
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <div className="relative">
          <button
            type="button"
            data-testid="columns-button"
            onClick={() => setColumnMenuOpen((v) => !v)}
            className="rounded-md border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wider text-fg-secondary transition-colors hover:border-gold hover:text-gold"
          >
            Columns
          </button>
          {columnMenuOpen && (
            <div
              data-testid="columns-menu"
              className="absolute right-0 z-20 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-border-subtle bg-bg-2 p-2 shadow-lg"
            >
              {table.getAllLeafColumns().map((c) => {
                const locked = c.id === UNHIDEABLE_COLUMN
                return (
                  <label
                    key={c.id}
                    data-testid={`col-toggle-${c.id}`}
                    className={`flex items-center gap-2 px-1.5 py-1 text-xs ${
                      locked ? 'text-fg-muted' : 'cursor-pointer text-fg-secondary hover:text-gold'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      disabled={locked}
                      onChange={c.getToggleVisibilityHandler()}
                    />
                    <span>{c.id}</span>
                  </label>
                )
              })}
              <button
                type="button"
                data-testid="columns-reset"
                onClick={() => setColumnVisibility(resetColumnVisibility())}
                className="mt-1 w-full rounded-sm border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors hover:border-gold hover:text-gold"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10 bg-bg-header">
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-border-subtle text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary"
              >
                {bulkEnabled && (
                  <th
                    style={{ width: 36 }}
                    className="group cursor-pointer px-3 py-2.5 text-center transition-colors duration-150 hover:bg-gold/10"
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all trades"
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 cursor-pointer rounded-[3px] accent-gold transition-shadow group-hover:ring-2 group-hover:ring-gold/50"
                    />
                  </th>
                )}
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
                <td colSpan={colCount} />
              </tr>
            )}
            {items.map((vi) => {
              const row = sortedRows[vi.index]
              if (!row) return null
              return (
                <TradesTableRow
                  key={row.original.id}
                  row={row}
                  isSelected={selectedIds.has(row.original.id)}
                  bulkEnabled={bulkEnabled}
                  index={vi.index}
                  onSelect={setSelectedId}
                  onToggle={toggleRow}
                  columnCount={columns.length}
                />
              )
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={colCount} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {bulkEnabled && (
        <TradesBulkActionBar
          count={selectedCount}
          netPnlTotal={bulkNetPnl}
          atCap={atCap}
          busy={bulkBusy}
          error={bulkError}
          onSetPlaybook={() => {
            setBulkRetagError(null)
            setBulkSetPlaybookOpen(true)
          }}
          onSetCatalyst={() => {
            setBulkRetagError(null)
            setBulkSetCatalystOpen(true)
          }}
          onSetMistakes={() => {
            setBulkRetagError(null)
            setBulkSetMistakesOpen(true)
          }}
          onMoveToTrash={() => {
            setBulkError(null)
            setBulkConfirmOpen(true)
          }}
          onClear={clearSelection}
        />
      )}

      {bulkEnabled && (
        <ConfirmModal
          open={bulkConfirmOpen}
          onClose={() => setBulkConfirmOpen(false)}
          title="Move trades to Trash?"
          confirmLabel={`Move ${selectedCount} to Trash`}
          busyLabel="Moving…"
          busy={bulkBusy}
          tone="destructive"
          onConfirm={handleBulkSoftDelete}
          body={
            <div className="flex flex-col gap-3">
              {/* The summary row sits felt-consistent inside the premium
                  panel: hairline border + translucent bg-0 inset (the hero
                  panel's inset idiom) instead of the flat bg-2 card. */}
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-0/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-base font-semibold text-fg-primary tnum">
                    {selectedCount} trade{selectedCount === 1 ? '' : 's'}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-fg-tertiary">
                    {bulkSymbolSummary}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Combined Net P&amp;L
                  </div>
                  <div
                    className={`font-mono text-sm font-semibold tnum ${pnlClass(bulkNetPnl)}`}
                  >
                    {signed(bulkNetPnl)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-fg-secondary">
                You can restore {selectedCount === 1 ? 'it' : 'them'} from Trash
                for 30 days.
              </p>
            </div>
          }
        />
      )}

      {bulkEnabled && (
        <BulkSetPlaybookModal
          open={bulkSetPlaybookOpen}
          onClose={() => setBulkSetPlaybookOpen(false)}
          count={selectedCount}
          netPnlTotal={bulkNetPnl}
          busy={bulkRetagBusy}
          error={bulkRetagError}
          onApply={handleBulkSetPlaybook}
        />
      )}

      {bulkEnabled && (
        <BulkSetCatalystModal
          open={bulkSetCatalystOpen}
          onClose={() => setBulkSetCatalystOpen(false)}
          count={selectedCount}
          netPnlTotal={bulkNetPnl}
          busy={bulkRetagBusy}
          error={bulkRetagError}
          onApply={handleBulkSetCatalyst}
        />
      )}

      {bulkEnabled && (
        <BulkSetMistakesModal
          open={bulkSetMistakesOpen}
          onClose={() => setBulkSetMistakesOpen(false)}
          count={selectedCount}
          netPnlTotal={bulkNetPnl}
          busy={bulkRetagBusy}
          error={bulkRetagError}
          onApply={handleBulkSetMistakes}
        />
      )}

      <TradeDetailModal
        trade={selectedTrade}
        onClose={() => setSelectedId(null)}
        navPosition={navPosition}
        onNavigate={setSelectedId}
        onSaveNote={onSaveNote}
        onSaveTimeframe={onSaveTimeframe}
        onSavePlaybook={onSavePlaybook}
        onSaveConfidence={onSaveConfidence}
        onSavePlannedRisk={onSavePlannedRisk}
        onSavePlannedStopLoss={onSavePlannedStopLoss}
        onSaveFloat={onSaveFloat}
        onSaveCatalyst={onSaveCatalyst}
        onSaveCountry={onSaveCountry}
        onSaveCountrySymbol={onSaveCountrySymbol}
        onMistakesChange={onMistakesChange}
        onSoftDelete={
          onSoftDelete
            ? async (id) => {
                await onSoftDelete(id)
                setSelectedId(null)
              }
            : undefined
        }
        onRestore={
          onRestore
            ? async (id) => {
                await onRestore(id)
                setSelectedId(null)
              }
            : undefined
        }
      />
    </div>
  )
}


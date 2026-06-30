import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { ipc } from '@/lib/ipc'
import { signed, pnlClass, longDate } from '@/lib/format'
import Card from '@/components/ui/Card'
import TypeToConfirmModal from '@/components/ui/TypeToConfirmModal'
import TrashRow from './TrashRow'
import TrashBulkActionBar from './TrashBulkActionBar'

// Which Delete Forever flow is armed. `bulk` reads the live selection (frozen
// while open); `single` targets one specific trade (count is always 1).
type DeleteForever =
  | { mode: 'bulk' }
  | { mode: 'single'; trade: TradeListRow }
  | null

// v0.2.3 P5 (LAST phase) — the Trash surface. A self-contained Settings card
// (DataBackfillCard model): self-fetches the soft-deleted trades, restores them
// (single + bulk, instant — decision #5), or permanently Deletes Forever behind
// the count-scaled type-to-confirm. Backend shipped in P2a/P2b; this is UI only.
//
// Sort is client-side deleted_at DESC (most recently deleted first) — the
// shared listTrades orders by open_time, and the Trash set is small, so we sort
// here rather than fork the query. No virtualization (D7): bounded counts, a
// secondary management surface.
//
// Selection-freeze contract: while a Delete Forever modal is open, the bulk N is
// derived from the selection (`() => String(selectedCount)`), so selection must
// not change underneath it. The toggle handlers no-op while frozen — the Modal
// backdrop blocks the rows visually, this guard makes it true in state too.
export default function TrashSection() {
  const [trash, setTrash] = useState<TradeListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [rowBusyId, setRowBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [deleteForever, setDeleteForever] = useState<DeleteForever>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .tradesList({ deleted: true })
      .then((list) => {
        if (!cancelled) setTrash(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // deleted_at is SQLite 'YYYY-MM-DD HH:MM:SS' (lexicographic === chronological);
  // sort descending so the most recently deleted trade is on top.
  const sorted = useMemo(() => {
    if (!trash) return []
    return [...trash].sort((a, b) =>
      (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''),
    )
  }, [trash])

  const selectedTrades = useMemo(
    () => sorted.filter((t) => selectedIds.has(t.id)),
    [sorted, selectedIds],
  )
  const selectedCount = selectedTrades.length
  const bulkNetPnl = useMemo(
    () => selectedTrades.reduce((sum, t) => sum + t.net_pnl, 0),
    [selectedTrades],
  )

  const frozen = deleteForever !== null

  // Intersection guard: when the list shrinks (a restore / delete removes rows),
  // drop any selected id that's no longer present. Our own handlers already
  // prune, so this is belt-and-suspenders — and it keeps selectedCount honest.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const present = new Set(sorted.map((t) => t.id))
      let changed = false
      const next = new Set<number>()
      for (const id of prev) {
        if (present.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [sorted])

  const toggleRow = useCallback(
    (id: number) => {
      if (frozen || bulkBusy) return
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [frozen, bulkBusy],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setBulkError(null)
  }, [])

  // Remove ids from the loaded list (the IPCs return void). Mirrors the P4
  // filter-on-success pattern.
  const dropFromList = useCallback((ids: number[]) => {
    const idSet = new Set(ids)
    setTrash((prev) => (prev ? prev.filter((t) => !idSet.has(t.id)) : prev))
  }, [])

  const handleRowRestore = useCallback(
    async (trade: TradeListRow) => {
      if (rowBusyId !== null || bulkBusy) return
      setRowBusyId(trade.id)
      setRowError(null)
      try {
        await ipc.tradeRestore(trade.id)
        dropFromList([trade.id])
      } catch (e) {
        setRowError(
          e instanceof Error ? e.message : 'Failed to restore the trade.',
        )
      } finally {
        setRowBusyId(null)
      }
    },
    [rowBusyId, bulkBusy, dropFromList],
  )

  const handleBulkRestore = useCallback(async () => {
    if (bulkBusy || selectedCount === 0) return
    const ids = selectedTrades.map((t) => t.id)
    setBulkBusy(true)
    setBulkError(null)
    try {
      await ipc.tradesRestoreBulk(ids)
      // Atomic success: the host list drops them and the selection clears.
      dropFromList(ids)
      setSelectedIds(new Set())
    } catch (e) {
      // Atomic reject (the batch rolled back): keep the selection for retry,
      // surface the error on the persistent bar (P4 pattern).
      setBulkError(
        e instanceof Error ? e.message : 'Failed to restore the trades.',
      )
    } finally {
      setBulkBusy(false)
    }
  }, [bulkBusy, selectedCount, selectedTrades, dropFromList])

  // onConfirm for the Delete Forever modal. The throw is allowed to propagate
  // so TypeToConfirmModal surfaces it inline (its error slot) and stays open
  // with the selection retained — a more natural expression of the same atomic
  // reject + retry intent than P4's modal-close-then-error (P4 used ConfirmModal,
  // which has no error slot). On success we close the modal here.
  const confirmDeleteForever = useCallback(async () => {
    const df = deleteForever
    if (!df) return
    if (df.mode === 'bulk') {
      const ids = selectedTrades.map((t) => t.id)
      await ipc.tradesHardDeleteBulk(ids)
      dropFromList(ids)
      setSelectedIds(new Set())
    } else {
      await ipc.tradeHardDelete(df.trade.id)
      dropFromList([df.trade.id])
    }
    setDeleteForever(null)
  }, [deleteForever, selectedTrades, dropFromList])

  const isBulk = deleteForever?.mode === 'bulk'
  // Count for the type-to-confirm gate: the live selection (bulk, frozen while
  // open) or a fixed 1 (single-row).
  const confirmCount = isBulk ? selectedCount : 1

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Trash
          </div>
          <div className="mt-1 text-sm text-fg-secondary">
            Restore deleted trades or remove them permanently. Deleted trades stay here for 30 days.
          </div>
        </div>
      </div>

      <Card
        title="Trash"
        hover={false}
        right={
          <span className="font-mono tnum text-fg-secondary">{trash?.length ?? 0}</span>
        }
      >
        <div className="space-y-3">
        {err && (
          <div className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-fg-secondary">
            Failed to load Trash: {err}
          </div>
        )}
        {rowError && (
          <div className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-loss">
            {rowError}
          </div>
        )}

        {trash === null && !err ? (
          <div className="text-sm text-fg-tertiary">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 px-4 py-8 text-center text-sm text-fg-tertiary">
            No deleted trades
          </div>
        ) : (
          <>
            <TrashBulkActionBar
              count={selectedCount}
              netPnlTotal={bulkNetPnl}
              busy={bulkBusy}
              error={bulkError}
              onRestore={handleBulkRestore}
              onDeleteForever={() => {
                setBulkError(null)
                setDeleteForever({ mode: 'bulk' })
              }}
              onClear={clearSelection}
            />
            <div className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/40">
              {sorted.map((trade) => (
                <TrashRow
                  key={trade.id}
                  trade={trade}
                  selected={selectedIds.has(trade.id)}
                  onToggle={() => toggleRow(trade.id)}
                  onRestore={() => void handleRowRestore(trade)}
                  onDeleteForever={() =>
                    setDeleteForever({ mode: 'single', trade })
                  }
                  busy={rowBusyId === trade.id}
                  disabled={
                    bulkBusy ||
                    frozen ||
                    (rowBusyId !== null && rowBusyId !== trade.id)
                  }
                />
              ))}
            </div>
          </>
        )}
        </div>
      </Card>

      {deleteForever && (
        <TypeToConfirmModal
          open
          onClose={() => setDeleteForever(null)}
          title={isBulk ? 'Permanently delete trades?' : 'Permanently delete trade?'}
          confirmWord={() => String(confirmCount)}
          confirmLabel="Delete forever"
          busyLabel="Deleting…"
          onConfirm={confirmDeleteForever}
          body={
            isBulk ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-mono text-base font-semibold text-fg-primary tnum">
                      {selectedCount} trade{selectedCount === 1 ? '' : 's'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-fg-tertiary">
                      {bulkSymbolSummary(selectedTrades)}
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
                  Type {selectedCount} to permanently delete{' '}
                  {selectedCount === 1 ? 'this trade' : `these ${selectedCount} trades`}.
                  This cannot be undone.
                </p>
              </div>
            ) : deleteForever.mode === 'single' ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-base font-semibold text-fg-primary">
                        {deleteForever.trade.symbol}
                      </span>
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          deleteForever.trade.side === 'short'
                            ? 'bg-loss-soft text-loss'
                            : 'bg-win-soft text-win'
                        }`}
                      >
                        {deleteForever.trade.side}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-fg-tertiary tnum">
                      {longDate(deleteForever.trade.date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                      Net P&amp;L
                    </div>
                    <div
                      className={`font-mono text-sm font-semibold tnum ${pnlClass(deleteForever.trade.net_pnl)}`}
                    >
                      {signed(deleteForever.trade.net_pnl)}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-fg-secondary">
                  Type 1 to permanently delete this trade. This cannot be undone.
                </p>
              </div>
            ) : null
          }
        />
      )}
    </div>
  )
}

// First 3 distinct symbols, then "and N more trades across M symbols" — matches
// the P4 bulk-confirm summary copy so the two destructive previews read alike.
function bulkSymbolSummary(trades: TradeListRow[]): string {
  if (trades.length === 0) return ''
  const distinct = Array.from(new Set(trades.map((t) => t.symbol)))
  if (trades.length <= 3) return distinct.join(', ')
  const head = distinct.slice(0, 3).join(', ')
  const moreTrades = trades.length - 3
  return `${head} and ${moreTrades} more trade${moreTrades === 1 ? '' : 's'} across ${distinct.length} symbol${distinct.length === 1 ? '' : 's'}`
}

import { useCallback, useMemo, useState } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { int, longDate, pnlClass, price, signed } from '@/lib/format'
import { getTradeNavPosition } from '@/core/trades/tradeNavigation'
import TradeDetailModal from '@/components/trades/TradeDetailModal'
import { ipc } from '@/lib/ipc'

// v0.2.7 — THE TRADES BEHIND A SETUP.
//
// Brendan: "inside each playbook setup, it would be nice to have a trades tab
// that show all trades that were listed under that setup instead of going to
// trades to find them." Not a tab in the end — a card in the right-hand stack,
// LAST, below the setup definition: the panel reads top to bottom as how this
// setup performs, what the setup is, and then the trades that say so. It first
// shipped between the numbers and the rules; seeing it in the running app
// reversed that, because a long list above the rules pushed them off the fold.
//
// WHAT THIS BORROWS, AND FROM WHERE. The eight-row cap with a "Show all N"
// expander is BucketTradeTable's interaction shape (the MACD bucket accordion),
// reused rather than re-invented. The row conventions are the day tab's: the
// side pill, the short-aware entry/exit flip, and position size as
// max(bought, sold) with the legs one hover away — the Dave #15 semantic, which
// exists because bought+sold rendered double the position on every closed trip.
//
// WHAT IT DOES NOT HAVE, and why. No Playbook column: inside a playbook's own
// panel every row carries the same setup, so the column would be a constant —
// width spent to repeat the heading. No sort controls and no row drill-through:
// the rows arrive newest-first from the read and stay that way, and the detail
// sheet those sibling tables open needs a technicals snapshot and a timeframe
// this page has no reason to fetch. Both are additions, not omissions to fix.

interface PlaybookTradesCardProps {
  /** The setup's trades, newest first (the read's own ORDER BY). */
  trades: TradeListRow[]
  /** The selected setup's name — used only in the empty line's copy. */
  setupName: string
  /** Re-run the page's own trades read. Called ONCE, on modal close, so an
   *  edit that moved a trade out of this setup is reflected only after the
   *  trader is finished with it. Optional: hosts that omit it get a card
   *  that opens the modal and simply does not refresh behind it. */
  onRefresh?: () => void
}

const DEFAULT_VISIBLE = 8

export default function PlaybookTradesCard({
  trades,
  setupName,
  onRefresh,
}: PlaybookTradesCardProps) {
  const [showAll, setShowAll] = useState(false)

  // THE SNAPSHOT, AND IT IS THE WHOLE RULING. The open trade and the list
  // the arrows walk are both taken at CLICK TIME and held until close. The
  // Trades tab resolves its open row from the LIVE filtered list, so an edit
  // that drops the row out of the filter nulls the modal's `trade` prop and
  // TradeDetailModal line one six seven unmounts it with no message. Here the
  // row is resolved from `frozen`, which the page cannot change while the
  // modal is open, so the same edit leaves the modal exactly where it was.
  //
  // useTradeStack already takes a click-time snapshot for the day and week
  // modals; this is that shape, holding the ROWS rather than only the ids so
  // the open trade survives a refresh underneath.
  const [frozen, setFrozen] = useState<TradeListRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // THE FULL SET, NEVER THE RENDERED SLICE. The table caps at DEFAULT_VISIBLE
  // rows while holding every row in memory, so a nav built from `visible`
  // would read "one of eight" on a nine trade setup and refuse to walk past
  // the cap. The order is the read's own ORDER BY, which is what the trader
  // sees.
  const navSource = frozen ?? trades
  const orderedIds = useMemo(() => navSource.map((t) => t.id), [navSource])
  const navPosition = useMemo(
    () => getTradeNavPosition(orderedIds, selectedId),
    [orderedIds, selectedId],
  )
  const selectedTrade =
    selectedId === null ? null : navSource.find((t) => t.id === selectedId) ?? null

  const openTrade = useCallback(
    (id: number) => {
      setFrozen(trades)
      setSelectedId(id)
    },
    [trades],
  )
  const closeTrade = useCallback(() => {
    setSelectedId(null)
    setFrozen(null)
    onRefresh?.()
  }, [onRefresh])

  // Persist, then patch the FROZEN copy in place. Patching rather than
  // refetching is what keeps the modal from moving under an edit; the page
  // behind is re-read once, on close.
  const patch = useCallback((updated: TradeListRow | null) => {
    if (!updated) return
    setFrozen((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const visible = showAll ? trades : trades.slice(0, DEFAULT_VISIBLE)
  const hasMore = trades.length > DEFAULT_VISIBLE

  return (
    <div data-playbook-trades className="card-premium">
      <div className="flex items-baseline justify-between border-b border-white/[0.05] px-5 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted">Trades</div>
        {trades.length > 0 && (
          <span className="font-mono text-[10px] text-fg-muted tnum">
            {showAll || !hasMore
              ? `${int(trades.length)} total`
              : `showing ${int(visible.length)} of ${int(trades.length)}`}
          </span>
        )}
      </div>

      {trades.length === 0 ? (
        /* A setup with nothing logged under it says so, once. The year grid's
           month tier renders NOTHING in the same situation, and that is right
           there — a tile is one of twelve on a surface being scanned. This is a
           destination the user deliberately opened, and silence on a page you
           navigated to reads as a failure to load. */
        <div
          data-playbook-trades-empty
          className="px-5 py-6 text-sm text-fg-tertiary"
        >
          No trades logged under {setupName} yet.
        </div>
      ) : (
        <div className="px-5 py-4">
          {/* NO VERTICAL CAP HERE. This box briefly carried its own six-hundred
              pixel scroll; the page now bounds itself to the shell's region and
              the right column is a single scroll region, so a cap here would be
              a scroll inside a scroll — you would chase rows in an inner box
              while the column that holds it scrolls too.

              The HORIZONTAL overflow stays: at the narrowest supported window
              this table still needs to slide sideways. */}
          <div data-playbook-trades-scroll className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-fg-tertiary">
                <Th>Date</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th align="right">Shares</Th>
                <Th align="right">Entry</Th>
                <Th align="right">Exit</Th>
                <Th align="right">Net P&amp;L</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                // Entry is the opening leg, exit the closing leg — flips for
                // shorts. The day tab's convention, kept identical so the same
                // trade reads the same on both surfaces.
                const entry = t.side === 'short' ? t.avg_sell_price : t.avg_buy_price
                const exit = t.side === 'short' ? t.avg_buy_price : t.avg_sell_price
                return (
                  <tr
                    key={t.id}
                    data-playbook-trade-row={t.id}
                    onClick={() => openTrade(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openTrade(t.id)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${t.symbol} on ${t.date}`}
                    className="cursor-pointer border-b border-border-subtle/40 transition-colors duration-150 hover:bg-white/[0.03] focus:bg-white/[0.03] focus:outline-none"
                  >
                    <Td className="font-mono text-fg-secondary">{longDate(t.date)}</Td>
                    <Td className="font-mono text-fg-primary">{t.symbol}</Td>
                    <Td>
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          t.side === 'short'
                            ? 'bg-loss-soft text-loss'
                            : 'bg-win-soft text-win'
                        }`}
                      >
                        {t.side}
                      </span>
                    </Td>
                    <Td
                      align="right"
                      className="font-mono tnum text-fg-secondary"
                      title={`Bought ${int(t.shares_bought)} · Sold ${int(t.shares_sold)}`}
                    >
                      {int(Math.max(t.shares_bought, t.shares_sold))}
                    </Td>
                    <Td align="right" className="font-mono tnum text-fg-secondary">
                      {price(entry)}
                    </Td>
                    <Td align="right" className="font-mono tnum text-fg-secondary">
                      {price(exit)}
                    </Td>
                    <Td
                      align="right"
                      className={`font-mono tnum font-medium ${pnlClass(t.net_pnl)}`}
                    >
                      {signed(t.net_pnl)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {hasMore && (
            <div className="mt-3 border-t border-border-subtle/60 pt-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
              >
                {showAll ? `Show first ${DEFAULT_VISIBLE}` : `Show all ${int(trades.length)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* The SAME modal the Trades tab and the day and week modals render.
          It already takes its list position as a prop, so a second caller
          needs no change to it: hand it a navPosition and an onNavigate and
          the chevrons, the counter and the arrow keys all work. The ends
          disable themselves, because getTradeNavPosition returns null there
          and the modal is already gated on that. */}
      <TradeDetailModal
        trade={selectedTrade}
        onClose={closeTrade}
        navPosition={navPosition}
        onNavigate={setSelectedId}
        onSaveNote={async (i) => patch(await ipc.tradeNoteSave(i))}
        onSaveTimeframe={async (i) => patch(await ipc.tradeTimeframeSave(i))}
        onSavePlaybook={async (i) => patch(await ipc.tradePlaybookSave(i))}
        onSaveConfidence={async (i) => patch(await ipc.tradeConfidenceSave(i))}
        onSavePlannedRisk={async (i) => patch(await ipc.tradePlannedRiskSave(i))}
        onSavePlannedStopLoss={async (i) => patch(await ipc.tradePlannedStopLossSave(i))}
        onSaveFloat={async (i) => patch(await ipc.tradeFloatSave(i))}
        onSaveCatalyst={async (i) => patch(await ipc.tradeCatalystSave(i))}
        onSaveCountry={async (i) => patch(await ipc.tradeCountrySave(i))}
        onMistakesChange={patch}
        onSoftDelete={async (id) => {
          await ipc.tradeSoftDelete(id)
          closeTrade()
        }}
      />
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={`pb-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  className = '',
  title,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
  title?: string
}) {
  return (
    <td
      title={title}
      className={`py-1.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </td>
  )
}

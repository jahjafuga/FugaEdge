import { useState } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { int, longDate, pnlClass, price, signed } from '@/lib/format'

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
}

const DEFAULT_VISIBLE = 8

export default function PlaybookTradesCard({
  trades,
  setupName,
}: PlaybookTradesCardProps) {
  const [showAll, setShowAll] = useState(false)

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
          {/* SELF-CONTAINED. Expanding the list must not move anything else on
              the page, so the rows scroll inside this box rather than growing
              it. The height is NOT a new number — it is the same
              max-h-[600px] the playbook list on this page already uses
              (src/pages/Playbook.tsx:288), so the two scroll regions in one
              view cannot disagree.

              The classes are UNCONDITIONAL: the same box in both states, never
              geometry that appears on expand. And they sit here rather than on
              the Card, because a Card that scrolls takes its own header away
              with the rows — and the expander below stays outside the box for
              the same reason, so it is still reachable at row twenty-nine. */}
          <div
            data-playbook-trades-scroll
            className="max-h-[600px] overflow-x-auto overflow-y-auto"
          >
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
                  <tr key={t.id} className="border-b border-border-subtle/40">
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

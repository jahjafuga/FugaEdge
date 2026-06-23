import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { formatEastern, int, price, signed, pnlClass } from '@/lib/format'

type SortMode = 'chrono' | 'pnl' | 'mistakes'

interface TradesTabProps {
  trades: TradeListRow[]
  /** Trade whose detail is open (Day 3.2 stacking) — highlights the row. */
  selectedTradeId: number | null
  onSelectTrade: (id: number) => void
}

// v0.2.2 Day 3.1 — day-scoped trade list. Lean by design (not the virtualized
// Trades-page TradesTable, which embeds its own TradeDetailModal at z-60 and
// would collide with the stacking model). Row click bubbles up via
// onSelectTrade so DayDetailModal owns the stacked modal in Day 3.2.
export default function TradesTab({ trades, selectedTradeId, onSelectTrade }: TradesTabProps) {
  const [sort, setSort] = useState<SortMode>('chrono')

  if (trades.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades on this day.
      </div>
    )
  }

  const sorted = [...trades].sort((a, b) => {
    if (sort === 'pnl') return b.net_pnl - a.net_pnl
    if (sort === 'mistakes') return b.mistakes.length - a.mistakes.length
    return a.open_time.localeCompare(b.open_time) // chronological ascending
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-xs">
        <span className="mr-1 text-fg-tertiary">Sort:</span>
        <SortButton active={sort === 'chrono'} onClick={() => setSort('chrono')}>Time</SortButton>
        <SortButton active={sort === 'pnl'} onClick={() => setSort('pnl')}>Biggest P&amp;L</SortButton>
        <SortButton active={sort === 'mistakes'} onClick={() => setSort('mistakes')}>Worst mistakes</SortButton>
      </div>

      <div className="overflow-x-auto card-premium">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
              <Th>Time</Th>
              <Th>Symbol</Th>
              <Th>Side</Th>
              <Th>Playbook</Th>
              <Th>Timeframe</Th>
              <Th align="right">Shares</Th>
              <Th align="right">Entry</Th>
              <Th align="right">Exit</Th>
              <Th align="right">Net P&amp;L</Th>
              <Th align="right">R</Th>
              <Th align="right">Mistakes</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const selected = t.id === selectedTradeId
              // Entry is the opening leg, exit the closing leg — flips for shorts.
              const entry = t.side === 'short' ? t.avg_sell_price : t.avg_buy_price
              const exit = t.side === 'short' ? t.avg_buy_price : t.avg_sell_price
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelectTrade(t.id)}
                  className={`cursor-pointer border-b border-border-subtle/40 transition-colors ${
                    selected ? 'bg-gold/[0.08]' : 'hover:bg-bg-4/50'
                  }`}
                >
                  <Td className="font-mono text-fg-secondary">{formatEastern(t.open_time).slice(0, 5)}</Td>
                  <Td className="font-mono text-fg-primary">{t.symbol}</Td>
                  <Td>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        t.side === 'short' ? 'bg-loss-soft text-loss' : 'bg-win-soft text-win'
                      }`}
                    >
                      {t.side}
                    </span>
                  </Td>
                  <Td className="text-fg-secondary">{t.playbook_name ?? '—'}</Td>
                  <Td className="text-fg-secondary">{t.entry_timeframe ?? '—'}</Td>
                  <Td align="right" className="font-mono tnum text-fg-secondary">{int(t.shares_bought + t.shares_sold)}</Td>
                  <Td align="right" className="font-mono tnum text-fg-secondary">{price(entry)}</Td>
                  <Td align="right" className="font-mono tnum text-fg-secondary">{price(exit)}</Td>
                  <Td align="right" className={`font-mono tnum font-medium ${pnlClass(t.net_pnl)}`}>{signed(t.net_pnl)}</Td>
                  <Td align="right" className="font-mono tnum text-fg-secondary">
                    {t.r_multiple == null ? '—' : `${t.r_multiple.toFixed(2)}R`}
                  </Td>
                  <Td align="right" className="font-mono tnum">
                    {t.mistakes.length > 0 ? (
                      <span className="text-loss">{t.mistakes.length}</span>
                    ) : (
                      <span className="text-fg-tertiary">0</span>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-sm px-2 py-1 transition-colors ${
        active ? 'bg-gold/15 text-gold' : 'text-fg-tertiary hover:text-fg-secondary'
      }`}
    >
      {children}
    </button>
  )
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>{children}</td>
}

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import { formatEastern, int, price, signed, pnlClass } from '@/lib/format'

type ViewMode = 'grouped' | 'chrono'

interface WeekTradesTabProps {
  trades: TradeListRow[]
  /** Trade whose stacked detail is open — highlights the row. */
  selectedTradeId: number | null
  /** Dave #17 — the click also hands up the view's canonical DISPLAYED order
   *  so the stack can snapshot it for prev/next cycling. */
  onSelectTrade: (id: number, orderedIds: number[]) => void
}

interface SymbolGroup {
  symbol: string
  trades: TradeListRow[]
  netPnl: number
  longs: number
  shorts: number
  firstTime: string
  lastTime: string
}

// v0.2.2 Day 4.5d — week-scoped trade list. Symbol-grouped + collapsed by
// default (the v0.3.0 scalability spec: at 37+ trades/week a flat list buries
// the review). Each symbol row expands inline to its trades; a chronological
// toggle covers the rarer flat-list case and resets per week (the tab unmounts
// on week change, so local state starts grouped each time). Drill-in reuses
// useTradeStack via onSelectTrade → stacked TradeDetailModal (z-210). Pure UI
// over detail.trades — no new aggregation.
export default function WeekTradesTab({ trades, selectedTradeId, onSelectTrade }: WeekTradesTabProps) {
  const [view, setView] = useState<ViewMode>('grouped')

  const groups = useMemo(() => groupBySymbol(trades), [trades])
  const chrono = useMemo(
    () => [...trades].sort((a, b) => a.open_time.localeCompare(b.open_time)),
    [trades],
  )

  // Dave #17 — the canonical click-time order for the CURRENT view. Grouped:
  // groups in displayed order, chronological within each — so cycling crosses
  // group boundaries in reading order, collapsed groups included. Chrono: the
  // flat list as displayed.
  const canonicalIds = useMemo(
    () =>
      view === 'chrono'
        ? chrono.map((t) => t.id)
        : groups.flatMap((g) =>
            [...g.trades]
              .sort((a, b) => a.open_time.localeCompare(b.open_time))
              .map((t) => t.id),
          ),
    [view, chrono, groups],
  )
  const select = (id: number) => onSelectTrade(id, canonicalIds)

  if (trades.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades this week.
      </div>
    )
  }

  const best = groups[0]
  const worst = groups[groups.length - 1]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-fg-tertiary">
          <span className="font-mono text-fg-secondary">{int(trades.length)}</span> trades ·{' '}
          <span className="font-mono text-fg-secondary">{int(groups.length)}</span>{' '}
          {groups.length === 1 ? 'symbol' : 'symbols'}
          {best && best.netPnl > 0 && (
            <>
              {' · best '}
              <span className="font-mono text-fg-primary">{best.symbol}</span>{' '}
              <span className="font-mono text-win">{signed(best.netPnl)}</span>
            </>
          )}
          {worst && worst.netPnl < 0 && (
            <>
              {' · worst '}
              <span className="font-mono text-fg-primary">{worst.symbol}</span>{' '}
              <span className="font-mono text-loss">{signed(worst.netPnl)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <ViewButton active={view === 'grouped'} onClick={() => setView('grouped')}>By symbol</ViewButton>
          <ViewButton active={view === 'chrono'} onClick={() => setView('chrono')}>Chronological</ViewButton>
        </div>
      </div>

      {view === 'grouped' ? (
        <div className="space-y-2">
          {groups.map((g) => (
            <SymbolGroupBlock
              key={g.symbol}
              group={g}
              selectedTradeId={selectedTradeId}
              onSelectTrade={select}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto card-premium">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
                <Th>Time</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th>Playbook</Th>
                <Th align="right">Shares</Th>
                <Th align="right">Entry</Th>
                <Th align="right">Exit</Th>
                <Th align="right">Net P&amp;L</Th>
                <Th align="right">R</Th>
                <Th align="right">Mistakes</Th>
              </tr>
            </thead>
            <tbody>
              {chrono.map((t) => (
                <TradeRow
                  key={t.id}
                  trade={t}
                  showSymbol
                  selected={t.id === selectedTradeId}
                  onSelect={select}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SymbolGroupBlock({
  group,
  selectedTradeId,
  onSelectTrade,
}: {
  group: SymbolGroup
  selectedTradeId: number | null
  onSelectTrade: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="overflow-hidden card-premium">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 bg-bg-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-4/40"
      >
        <Chevron size={15} strokeWidth={2} className="shrink-0 text-fg-tertiary" />
        <span className="font-mono text-sm font-medium text-fg-primary">{group.symbol}</span>
        <span className="text-xs text-fg-tertiary">
          {int(group.trades.length)} {group.trades.length === 1 ? 'trade' : 'trades'}
        </span>
        <span className="text-xs text-fg-tertiary">
          {group.longs}L / {group.shorts}S
        </span>
        <span className="font-mono text-[11px] text-fg-tertiary tnum">
          {formatEastern(group.firstTime).slice(0, 5)}–{formatEastern(group.lastTime).slice(0, 5)}
        </span>
        <span className={`ml-auto font-mono text-sm font-semibold tnum ${pnlClass(group.netPnl)}`}>
          {signed(group.netPnl)}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle/60 bg-bg-2/50 text-[10px] uppercase tracking-wider text-fg-tertiary">
                <Th>Time</Th>
                <Th>Side</Th>
                <Th>Playbook</Th>
                <Th align="right">Shares</Th>
                <Th align="right">Entry</Th>
                <Th align="right">Exit</Th>
                <Th align="right">Net P&amp;L</Th>
                <Th align="right">R</Th>
                <Th align="right">Mistakes</Th>
              </tr>
            </thead>
            <tbody>
              {[...group.trades]
                .sort((a, b) => a.open_time.localeCompare(b.open_time))
                .map((t) => (
                  <TradeRow
                    key={t.id}
                    trade={t}
                    showSymbol={false}
                    selected={t.id === selectedTradeId}
                    onSelect={onSelectTrade}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TradeRow({
  trade: t,
  showSymbol,
  selected,
  onSelect,
}: {
  trade: TradeListRow
  showSymbol: boolean
  selected: boolean
  onSelect: (id: number) => void
}) {
  // Entry is the opening leg, exit the closing leg — flips for shorts.
  const entry = t.side === 'short' ? t.avg_sell_price : t.avg_buy_price
  const exit = t.side === 'short' ? t.avg_buy_price : t.avg_sell_price
  return (
    <tr
      onClick={() => onSelect(t.id)}
      className={`cursor-pointer border-b border-border-subtle/40 transition-colors ${
        selected ? 'bg-gold/[0.08]' : 'hover:bg-bg-4/50'
      }`}
    >
      <Td className="font-mono text-fg-secondary">{formatEastern(t.open_time).slice(0, 5)}</Td>
      {showSymbol && <Td className="font-mono text-fg-primary">{t.symbol}</Td>}
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
      {/* Dave #15 — position size (max of legs, the metrics-layer convention),
          NOT bought+sold: that sum double-counted every closed trip. One
          TradeRow serves both week views, so this is the whole week fix. */}
      <Td
        align="right"
        className="font-mono tnum text-fg-secondary"
        title={`Bought ${int(t.shares_bought)} · Sold ${int(t.shares_sold)}`}
      >
        {int(Math.max(t.shares_bought, t.shares_sold))}
      </Td>
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
}

// Group trades by symbol; sort groups by net P&L desc (ties: count desc, then
// symbol) — matches the symbolBreakdown convention in week.ts.
function groupBySymbol(trades: TradeListRow[]): SymbolGroup[] {
  const map = new Map<string, SymbolGroup>()
  for (const t of trades) {
    let g = map.get(t.symbol)
    if (!g) {
      g = { symbol: t.symbol, trades: [], netPnl: 0, longs: 0, shorts: 0, firstTime: t.open_time, lastTime: t.close_time ?? t.open_time }
      map.set(t.symbol, g)
    }
    g.trades.push(t)
    g.netPnl += t.net_pnl
    if (t.side === 'short') g.shorts += 1
    else g.longs += 1
    if (t.open_time < g.firstTime) g.firstTime = t.open_time
    const end = t.close_time ?? t.open_time
    if (end > g.lastTime) g.lastTime = end
  }
  return [...map.values()].sort((a, b) => {
    if (a.netPnl !== b.netPnl) return b.netPnl - a.netPnl
    if (a.trades.length !== b.trades.length) return b.trades.length - a.trades.length
    return a.symbol.localeCompare(b.symbol)
  })
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
  title,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
  title?: string
}) {
  return (
    <td
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      title={title}
    >
      {children}
    </td>
  )
}

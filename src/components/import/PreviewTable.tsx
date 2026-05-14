import { useState } from 'react'
import type { RoundTrip } from '@shared/import-types'
import { money, price, int, pnlClass, signed, longDate } from '@/lib/format'

interface PreviewTableProps {
  trips: RoundTrip[]
}

export default function PreviewTable({ trips }: PreviewTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (trips.length === 0) {
    return (
      <div className="rounded-md border border-border bg-panel px-6 py-12 text-center text-sm text-muted">
        No round trips computed from this file.
      </div>
    )
  }

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="overflow-hidden rounded-md border border-border bg-panel">
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-bg-header">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
              <Th align="left">Status</Th>
              <Th align="left">Date</Th>
              <Th align="left">Open</Th>
              <Th align="left">Close</Th>
              <Th align="left">Symbol</Th>
              <Th align="left">Side</Th>
              <Th align="right">Bought</Th>
              <Th align="right">Buy avg</Th>
              <Th align="right">Sold</Th>
              <Th align="right">Sell avg</Th>
              <Th align="right">Fills</Th>
              <Th align="right">Gross P&amp;L</Th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => {
              const isExpanded = expanded.has(i)
              return (
                <>
                  <tr
                    key={`${t.exec_hash}-row`}
                    onClick={() => toggle(i)}
                    className={`cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-white/[0.02] ${
                      t.status === 'duplicate' ? 'opacity-50' : ''
                    }`}
                  >
                    <Td>
                      {t.status === 'duplicate' ? (
                        <Pill tone="muted">dup</Pill>
                      ) : t.is_open ? (
                        <Pill tone="warn">open</Pill>
                      ) : (
                        <Pill tone="new">new</Pill>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-subtle">{longDate(t.date)}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-text">{timeOf(t.open_time)}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-text">
                        {t.close_time ? timeOf(t.close_time) : '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono font-medium text-text">{t.symbol}</span>
                    </Td>
                    <Td>
                      <span
 className={`text-xs uppercase ${
                          t.side === 'short' ? 'text-red' : 'text-win'
                        }`}
                      >
                        {t.side}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-text">{int(t.shares_bought)}</span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-subtle">{price(t.avg_buy_price)}</span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-text">{int(t.shares_sold)}</span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-subtle">{price(t.avg_sell_price)}</span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-muted">{int(t.executions.length)}</span>
                    </Td>
                    <Td align="right">
                      <span className={`font-mono font-medium ${pnlClass(t.gross_pnl)}`}>
                        {signed(t.gross_pnl)}
                      </span>
                    </Td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${t.exec_hash}-fills`} className="border-b border-border/40">
                      <td colSpan={12} className="bg-bg/40 px-6 py-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted">
                          {t.executions.length} fill{t.executions.length === 1 ? '' : 's'}
                        </div>
                        <div className="mt-2 grid grid-cols-[80px_60px_60px_80px_1fr] gap-x-4 gap-y-1 font-mono text-xs">
                          {t.executions.map((e) => (
                            <div key={`${e.trade_id}-${e.order_id}-${e.time}`} className="contents">
                              <div className="text-muted">{timeOf(e.time)}</div>
                              <div className={e.side === 'B' ? 'text-win' : 'text-red'}>
                                {e.side}
                              </div>
                              <div className="text-text text-right">{int(e.qty)}</div>
                              <div className="text-subtle text-right">{price(e.price)}</div>
                              <div className="text-muted text-right">
                                {money(e.qty * e.price)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Pill({
  tone,
  children,
}: {
  tone: 'new' | 'muted' | 'warn'
  children: React.ReactNode
}) {
  const cls =
    tone === 'new'
      ? 'bg-win/15 text-win'
      : tone === 'warn'
        ? 'bg-red/15 text-red'
        : 'bg-white/[0.05] text-muted'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
  )
}

function timeOf(iso: string): string {
  const t = iso.split('T')[1]
  if (!t) return iso
  // "08:35:11" → "08:35:11"; we keep seconds for trade granularity.
  return t
}

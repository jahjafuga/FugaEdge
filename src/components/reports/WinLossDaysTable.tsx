import type { DayBreakdown } from '@shared/reports-types'
import { int, longDate, money, pnlClass, signed } from '@/lib/format'

interface WinLossDaysTableProps {
  days: DayBreakdown[]
}

export default function WinLossDaysTable({ days }: WinLossDaysTableProps) {
  if (days.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-fg-tertiary">
        No trading days yet.
      </div>
    )
  }

  // Newest first feels most natural in a day-by-day review.
  const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-bg-header">
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-fg-tertiary">
            <Th>Date</Th>
            <Th align="right">Trades</Th>
            <Th align="right">W</Th>
            <Th align="right">L</Th>
            <Th align="right">Scr</Th>
            <Th align="right">Gross P&amp;L</Th>
            <Th align="right">Fees</Th>
            <Th align="right">Net P&amp;L</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
            const tint =
              d.net_pnl > 0
                ? 'bg-win/[0.04] hover:bg-win/[0.08]'
                : d.net_pnl < 0
                  ? 'bg-loss/[0.04] hover:bg-loss/[0.08]'
                  : 'hover:bg-bg-3'
            return (
              <tr
                key={d.date}
                className={`border-b border-border-subtle last:border-b-0 transition-colors duration-150 ${tint}`}
              >
                <Td>
                  <span className="font-mono text-xs text-fg-primary">{longDate(d.date)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-primary">{int(d.trade_count)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-win">{int(d.winners)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-loss">{int(d.losers)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-tertiary">{int(d.scratches)}</span>
                </Td>
                <Td align="right">
                  <span className={`font-mono ${pnlClass(d.gross_pnl)}`}>
                    {signed(d.gross_pnl)}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-loss">{money(d.total_fees)}</span>
                </Td>
                <Td align="right">
                  <span className={`font-mono font-medium ${pnlClass(d.net_pnl)}`}>
                    {signed(d.net_pnl)}
                  </span>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
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

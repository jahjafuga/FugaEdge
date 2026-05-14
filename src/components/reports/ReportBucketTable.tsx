import type { ReactNode } from 'react'
import type { BucketStats } from '@shared/reports-types'
import { money, int, signed, pnlClass } from '@/lib/format'

interface ReportBucketTableProps {
  keyHeader: string         // column header for the bucket dimension
  buckets: BucketStats[]
  /** Custom renderer for the key column. Defaults to plain mono text of
   *  `bucket.key`. Use this to prepend a flag emoji, swap an ISO code for
   *  a human name, etc. */
  cellRenderer?: (bucket: BucketStats) => ReactNode
  /** Custom empty-state message. Defaults to a generic "No data" string —
   *  override when the breakdown has a known threshold the user can act on
   *  (e.g. "Add country to 3+ trades to see breakdown."). */
  emptyText?: string
}

const DASH = '—'
const DEFAULT_EMPTY_TEXT = 'No data for this breakdown.'

export default function ReportBucketTable({
  keyHeader,
  buckets,
  cellRenderer,
  emptyText = DEFAULT_EMPTY_TEXT,
}: ReportBucketTableProps) {
  if (buckets.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-fg-tertiary">
        {emptyText}
      </div>
    )
  }

  const absMax = Math.max(...buckets.map((b) => Math.abs(b.net_pnl)), 1)

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-header text-[10px] uppercase tracking-widest text-fg-tertiary">
            <Th>{keyHeader}</Th>
            <Th align="right">Trades</Th>
            <Th align="center">P&amp;L</Th>
            <Th align="right">Net P&amp;L</Th>
            <Th align="right">Win rate</Th>
            <Th align="right">Avg winner</Th>
            <Th align="right">Avg loser</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr
              key={b.key}
              className="border-b border-border-subtle last:border-b-0 transition-colors hover:bg-bg-3"
            >
              <Td>
                {cellRenderer ? (
                  cellRenderer(b)
                ) : (
                  <span className="font-mono text-sm text-fg-primary">{b.key}</span>
                )}
              </Td>
              <Td align="right">
                <span className="font-mono text-fg-primary">{int(b.trade_count)}</span>
              </Td>
              <Td align="center">
                <PnlBar value={b.net_pnl} absMax={absMax} />
              </Td>
              <Td align="right">
                <span className={`font-mono font-medium ${pnlClass(b.net_pnl)}`}>
                  {signed(b.net_pnl)}
                </span>
              </Td>
              <Td align="right">
                {b.win_rate === null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-gold">
                    {(b.win_rate * 100).toFixed(0)}%
                  </span>
                )}
              </Td>
              <Td align="right">
                {b.avg_winner === null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-win">{money(b.avg_winner)}</span>
                )}
              </Td>
              <Td align="right">
                {b.avg_loser === null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-loss">{money(b.avg_loser)}</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Centered P&L bar — zero line in the middle, green extends right, red extends
// left. Largest |value| fills exactly half the cell so signs stay visually
// balanced.
function PnlBar({ value, absMax }: { value: number; absMax: number }) {
  const pct = Math.min(100, (Math.abs(value) / absMax) * 50)
  return (
    <div className="relative mx-auto h-2.5 w-full max-w-[180px] rounded-sm bg-white/[0.03]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border/80" />
      {value > 0 && (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-win/70"
          style={{ width: `${pct}%` }}
        />
      )}
      {value < 0 && (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-loss/70"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const cls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`px-3 py-2 font-semibold ${cls}`}>{children}</th>
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const cls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`px-3 py-2 ${cls}`}>{children}</td>
}

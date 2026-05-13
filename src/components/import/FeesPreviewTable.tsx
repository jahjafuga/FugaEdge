import type { DaySummaryFeeRow } from '@shared/import-types'
import { money, int, longDate } from '@/lib/format'

interface FeesPreviewTableProps {
  fees: DaySummaryFeeRow[]
  dateOverride: string
}

export default function FeesPreviewTable({ fees, dateOverride }: FeesPreviewTableProps) {
  if (fees.length === 0) return null

  return (
    <div className="overflow-hidden rounded-md border border-border bg-panel">
      <div className="flex items-baseline justify-between border-b border-border/60 px-5 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Daily summary fees
          </div>
          <div className="mt-0.5 text-sm text-subtle">
            Applied pro-rata across round trips of the same symbol on the same date.
          </div>
        </div>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-bg-header">
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <Th align="left">Status</Th>
              <Th align="left">Date</Th>
              <Th align="left">Symbol</Th>
              <Th align="right">Trips</Th>
              <Th align="right">ECN</Th>
              <Th align="right">SEC</Th>
              <Th align="right">FINRA</Th>
              <Th align="right">HTB</Th>
              <Th align="right">CAT</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f, i) => {
              const effectiveDate = f.date || dateOverride
              const hasDate = !!effectiveDate
              return (
                <tr
                  key={`${f.symbol}-${i}`}
                  className={`border-b border-border/40 last:border-b-0 ${
                    f.status === 'replace' ? 'opacity-70' : ''
                  } ${f.matchedTrips === 0 ? 'opacity-50' : ''}`}
                >
                  <Td>
                    {f.status === 'replace' ? (
                      <Pill tone="dup">replace</Pill>
                    ) : (
                      <Pill tone="new">new</Pill>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-subtle">
                      {hasDate ? longDate(effectiveDate) : (
                        <span className="text-red">no date</span>
                      )}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono font-medium text-text">{f.symbol}</span>
                  </Td>
                  <Td align="right">
                    <span className={`font-mono ${f.matchedTrips === 0 ? 'text-red' : 'text-text'}`}>
                      {int(f.matchedTrips)}
                    </span>
                  </Td>
                  <Td align="right"><Mono>{money(f.fee_ecn)}</Mono></Td>
                  <Td align="right"><Mono>{money(f.fee_sec)}</Mono></Td>
                  <Td align="right"><Mono>{money(f.fee_finra)}</Mono></Td>
                  <Td align="right"><Mono>{money(f.fee_htb)}</Mono></Td>
                  <Td align="right"><Mono>{money(f.fee_cat)}</Mono></Td>
                  <Td align="right">
                    <span className="font-mono font-medium text-red">
                      {money(f.total_fees)}
                    </span>
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

function Pill({
  tone,
  children,
}: {
  tone: 'new' | 'dup'
  children: React.ReactNode
}) {
  const cls = tone === 'new' ? 'bg-win/15 text-win' : 'bg-gold/15 text-gold'
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}
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
    <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-muted">{children}</span>
}

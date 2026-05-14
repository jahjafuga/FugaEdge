import type { LatestSession } from '@shared/dashboard-types'
import { money, price, int, signed, pnlClass, longDate } from '@/lib/format'

interface LatestSessionTableProps {
  session: LatestSession
  today: string
}

// MASTER §5.3 — data-dense table. 36px row, bg-1 header sticky, mono right-
// aligned numerics with row tint for wins/losses.
export default function LatestSessionTable({ session, today }: LatestSessionTableProps) {
  if (!session.date || session.trades.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-fg-tertiary">
        No trades yet. Use the Import page to add some.
      </div>
    )
  }

  const isToday = session.date === today
  const dateLabel = longDate(session.date)
  const wlSpread = session.winners - session.losers

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border-subtle px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold text-fg-primary">
            {isToday ? 'Today' : dateLabel}
          </span>
          {isToday && (
            <span className="font-mono text-xs text-fg-tertiary tnum">{dateLabel}</span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-5 text-xs text-fg-secondary">
          <span>
            <span className="text-fg-tertiary">Net</span>{' '}
            <span className={`font-mono font-semibold tnum ${pnlClass(session.net_pnl)}`}>
              {signed(session.net_pnl)}
            </span>
          </span>
          <span>
            <span className="text-fg-tertiary">Fees</span>{' '}
            <span className="font-mono text-loss tnum">{money(session.total_fees)}</span>
          </span>
          <span>
            <span className="text-fg-tertiary">Trades</span>{' '}
            <span className="font-mono text-fg-primary tnum">{int(session.trade_count)}</span>
          </span>
          <span>
            <span className="text-fg-tertiary">W/L</span>{' '}
            <span className="font-mono text-win tnum">{int(session.winners)}</span>
            <span className="text-fg-muted">/</span>
            <span className="font-mono text-loss tnum">{int(session.losers)}</span>
            <span
              className={`ml-1.5 font-mono text-xs tnum ${
                wlSpread > 0 ? 'text-win' : wlSpread < 0 ? 'text-loss' : 'text-fg-muted'
              }`}
            >
              ({wlSpread > 0 ? '+' : ''}{wlSpread})
            </span>
          </span>
        </div>
      </div>

      <div className="max-h-[320px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-bg-header">
            <tr className="border-b border-border-subtle text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
              <Th align="left">Symbol</Th>
              <Th align="left">Side</Th>
              <Th align="left">Playbook</Th>
              <Th align="center">Conf</Th>
              <Th align="right">Bought</Th>
              <Th align="right">Buy avg</Th>
              <Th align="right">Sold</Th>
              <Th align="right">Sell avg</Th>
              <Th align="right">Fees</Th>
              <Th align="right">Net P&amp;L</Th>
            </tr>
          </thead>
          <tbody>
            {session.trades.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border-subtle/60 transition-colors duration-150 last:border-b-0 hover:bg-bg-3"
              >
                <Td>
                  <span className="font-mono font-semibold text-fg-primary">{t.symbol}</span>
                </Td>
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
                <Td>
                  {t.playbook_name ? (
                    <span className="rounded-sm bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                      {t.playbook_name}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-fg-muted">—</span>
                  )}
                </Td>
                <Td align="center">
                  <ConfidenceDots value={t.confidence} />
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-primary tnum">{int(t.shares_bought)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-secondary tnum">{price(t.avg_buy_price)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-primary tnum">{int(t.shares_sold)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-secondary tnum">{price(t.avg_sell_price)}</span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-tertiary tnum">{money(t.total_fees)}</span>
                </Td>
                <Td align="right">
                  <span className={`font-mono font-semibold tnum ${pnlClass(t.net_pnl)}`}>
                    {signed(t.net_pnl)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type Align = 'left' | 'right' | 'center'
function alignClass(a: Align): string {
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: Align }) {
  return (
    <th className={`px-3 py-2.5 font-semibold ${alignClass(align)}`}>{children}</th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: Align
}) {
  return (
    <td className={`px-3 py-2 ${alignClass(align)}`}>{children}</td>
  )
}

function ConfidenceDots({ value }: { value: number | null }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            value != null && n <= value ? 'bg-gold' : 'bg-gold/15'
          }`}
        />
      ))}
    </span>
  )
}

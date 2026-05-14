import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import type { MistakesAnalytics } from '@shared/analytics-types'
import { int, money, pnlClass, signed } from '@/lib/format'

interface MistakesCardProps {
  data: MistakesAnalytics
}

const DASH = '—'

export default function MistakesCard({ data }: MistakesCardProps) {
  const totalTagged = data.trades_with_any_mistake + data.trades_without_mistakes

  return (
    <Card
      title="Mistakes"
      subtitle="Tagged mistakes per trade, frequency and P&L impact."
      hover
      right={
        <Tooltip
          content={
            <>
              A trade can be tagged with multiple mistakes — each one shows up
              in its own row. The clean-vs-flawed compare bucket-checks every
              trade as a whole: any mistake at all counts as flawed.
            </>
          }
        >
          <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
        </Tooltip>
      }
    >
      {/* Clean vs flawed compare */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Side
          label="Clean trades"
          sublabel="No mistakes tagged"
          count={data.trades_without_mistakes}
          netPnl={data.clean_net_pnl}
          winRate={data.clean_win_rate}
          tone="green"
        />
        <Side
          label="Flawed trades"
          sublabel="At least one mistake tagged"
          count={data.trades_with_any_mistake}
          netPnl={data.flawed_net_pnl}
          winRate={data.flawed_win_rate}
          tone="red"
        />
      </div>

      {totalTagged === 0 ? (
        <div className="mt-5 rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 uppercase tracking-wider text-gold">
            Awaiting data
          </div>
          Tag mistakes on individual trades via the Trades page expand row. Edit
          the list itself in Settings → Mistake list.
        </div>
      ) : data.byMistake.length === 0 ? (
        <div className="mt-5 text-center text-sm text-fg-tertiary">
          No mistakes tagged on any trade yet — go you.
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
            Per mistake — worst P&L impact first
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-fg-tertiary">
                <Th>Mistake</Th>
                <Th align="right">Trades</Th>
                <Th align="right">Net P&amp;L</Th>
                <Th align="right">Avg P&amp;L</Th>
                <Th align="right">Win rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.byMistake.map((m) => (
                <tr
                  key={m.label}
                  className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015]"
                >
                  <Td>
                    <span className="rounded-sm bg-loss/[0.10] px-1.5 py-0.5 text-[10px] text-loss">
                      {m.label}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-fg-primary">{int(m.trade_count)}</span>
                  </Td>
                  <Td align="right">
                    <span className={`font-mono font-medium ${pnlClass(m.net_pnl)}`}>
                      {signed(m.net_pnl)}
                    </span>
                  </Td>
                  <Td align="right">
                    {m.avg_pnl == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className={`font-mono ${pnlClass(m.avg_pnl)}`}>
                        {money(m.avg_pnl)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {m.win_rate == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className="font-mono text-gold">
                        {(m.win_rate * 100).toFixed(0)}%
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Side({
  label,
  sublabel,
  count,
  netPnl,
  winRate,
  tone,
}: {
  label: string
  sublabel: string
  count: number
  netPnl: number
  winRate: number | null
  tone: 'green' | 'red'
}) {
  const borderClass = tone === 'green' ? 'border-win/30' : 'border-loss/30'
  return (
    <div className={`rounded-md border ${borderClass} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-1 text-[11px] text-fg-secondary">{sublabel}</div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Trades</div>
          <div className="mt-0.5 font-mono text-lg text-fg-primary">{int(count)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Net P&L</div>
          <div className={`mt-0.5 font-mono text-lg font-medium ${pnlClass(netPnl)}`}>
            {count > 0 ? signed(netPnl) : DASH}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Win rate</div>
          <div className="mt-0.5 font-mono text-lg text-gold">
            {winRate == null ? DASH : `${(winRate * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>
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
  return <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
}

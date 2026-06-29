import Card from '@/components/ui/Card'
import { Info } from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import type { RuleBreaksAnalytics } from '@shared/analytics-types'
import { int, money, percent, pnlClass, signed } from '@/lib/format'

interface RuleBreaksCardProps {
  data: RuleBreaksAnalytics
}

const DASH = '—'

// Phase 3 (djsevans87) — the day-level sibling of MistakesCard. Same shape (a
// clean-vs-flawed compare + a per-label table, worst-net-first), but aggregated
// per DAY: a "flawed day" is a day on which a rule was broken; a day with several
// breaks shows under each break's row yet counts once in the compare. No axis
// split (rule-breaks are a flat list).
export default function RuleBreaksCard({ data }: RuleBreaksCardProps) {
  const totalDays = data.days_with_any_break + data.clean_days

  return (
    <Card
      title="Daily rule breaks"
      subtitle="Day-level rule breaks tagged per day — frequency, P&L, and green-day rate."
      hover
      right={
        <Tooltip
          content={
            <>
              These aggregate per DAY, not per trade. A day on which you broke a
              rule is one "flawed day"; a day with several breaks shows under each
              break's row but counts once in the clean-vs-flawed split. Tag breaks
              on the day-detail modal's Rule Breaks tab.
            </>
          }
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" className="cursor-help text-fg-tertiary" />
        </Tooltip>
      }
    >
      {/* Clean vs flawed compare — BY DAY */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Side
          label="Clean days"
          sublabel="No rule broken"
          count={data.clean_days}
          netPnl={data.clean_day_net_pnl}
          greenRate={data.clean_green_rate}
          tone="green"
        />
        <Side
          label="Flawed days"
          sublabel="At least one rule broken"
          count={data.days_with_any_break}
          netPnl={data.flawed_day_net_pnl}
          greenRate={data.flawed_green_rate}
          tone="red"
        />
      </div>

      {totalDays === 0 ? (
        <div className="mt-5 rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 uppercase tracking-wider text-gold">Awaiting data</div>
          Tag day-level rule breaks on the Calendar → a day → Rule Breaks tab. Edit
          the list itself in Settings → Daily Rule Breaks.
        </div>
      ) : data.byRuleBreak.length === 0 ? (
        <div className="mt-5 text-center text-sm text-fg-tertiary">
          No rule breaks tagged on any day yet — clean.
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
            Per rule break — worst P&L impact first
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-fg-tertiary">
                <Th>Rule break</Th>
                <Th align="right">Days</Th>
                <Th align="right">Net P&amp;L</Th>
                <Th align="right">Avg P&amp;L / day</Th>
                <Th align="right">Green-day rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.byRuleBreak.map((b) => (
                <tr
                  key={b.label}
                  className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015]"
                >
                  <Td>
                    <span className="rounded-sm bg-loss/[0.10] px-1.5 py-0.5 text-[10px] text-loss">
                      {b.label}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-fg-primary">{int(b.day_count)}</span>
                  </Td>
                  <Td align="right">
                    <span className={`font-mono font-medium ${pnlClass(b.net_pnl)}`}>
                      {signed(b.net_pnl)}
                    </span>
                  </Td>
                  <Td align="right">
                    {b.avg_pnl_per_day == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className={`font-mono ${pnlClass(b.avg_pnl_per_day)}`}>
                        {money(b.avg_pnl_per_day)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {b.green_day_rate == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className="font-mono text-gold">
                        {percent(b.green_day_rate, 0)}
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
  greenRate,
  tone,
}: {
  label: string
  sublabel: string
  count: number
  netPnl: number
  greenRate: number | null
  tone: 'green' | 'red'
}) {
  const borderClass = tone === 'green' ? 'border-win/30' : 'border-loss/30'
  return (
    <div className={`rounded-md border ${borderClass} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-1 text-[11px] text-fg-secondary">{sublabel}</div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Days</div>
          <div className="mt-0.5 font-mono text-lg text-fg-primary">{int(count)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Net P&L</div>
          <div className={`mt-0.5 font-mono text-lg font-medium ${pnlClass(netPnl)}`}>
            {count > 0 ? signed(netPnl) : DASH}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Green days</div>
          <div className="mt-0.5 font-mono text-lg text-gold">
            {greenRate == null ? DASH : percent(greenRate, 0)}
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

import Card from '@/components/ui/Card'
import { int, pnlClass, shortDate, signed } from '@/lib/format'
import type { LadderWording } from '@shared/period-wording'
import type { MonthWeekSummary } from '@shared/week-types'

const DASH = '—'

interface MonthWeeksTabProps {
  rows: readonly MonthWeekSummary[]
  /** The period's own words, supplied by whoever mounts this tab. */
  wording: LadderWording
  /** Opens the row's WHOLE week -- weekStart, never the clipped from. */
  onOpenWeek: (weekStart: string) => void
}

// THE WEEKS INSIDE THE MONTH, EACH SUMMING INTO IT.
//
// Every row is the part of a week that lies inside the month, so the five rows
// of June 2026 add to June 2026 exactly: 140 trades, +4,247.00, 21 trading
// days. That is what makes the ladder worth reading -- a trader can check it
// against the topline in their head and the arithmetic will hold.
//
// A ROW SHOWS ITS CLIP AND OPENS ITS WEEK. The first row of June reads
// "Jun 1 – Jun 6, 6 days" and opens May 31 – Jun 6. Those are different
// windows on purpose: the numbers belong to the month, and the review belongs
// to the week.
//
// AN UNTRADED WEEK IS AN ABSENCE, NOT A ZERO. The row stays -- the rows tile
// the month, and a missing one would break a partition the trader can see --
// but its numbers are em dashes. A week you did not trade is not a week you
// made nothing in, and the year grid already says so in the same voice
// (calendar-types.ts:133-137: "the renderer treats trade_count === 0 as the
// empty state (em-dash, not $0)").
//
// THE ONLY COLOUR IS P&L SIGN. pnlClass, the same win/loss semantics the whole
// app uses. Nothing decorative: a straddling row is not tinted, a best week is
// not badged.
export default function MonthWeeksTab({ rows, wording, onOpenWeek }: MonthWeeksTabProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        {wording.empty}
      </div>
    )
  }

  return (
    <Card title={wording.title} subtitle={wording.subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-fg-tertiary">
              <th className="px-3 py-2 text-left font-semibold">Week</th>
              <th className="px-3 py-2 text-right font-semibold">Days</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Net P&amp;L</th>
              <th className="px-3 py-2 text-right font-semibold">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const traded = r.tradeCount > 0
              return (
                <tr
                  key={r.weekStart}
                  onClick={() => onOpenWeek(r.weekStart)}
                  // The whole row is the target, so the click lands wherever
                  // the eye is. Keyboard reaches it too: a row is focusable and
                  // Enter opens it, matching the trade rows in WeekTradesTab.
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenWeek(r.weekStart)
                    }
                  }}
                  className="cursor-pointer border-b border-white/[0.04] transition-colors duration-150 last:border-0 hover:bg-white/[0.03] focus:bg-white/[0.03] focus:outline-none"
                >
                  <td className="px-3 py-2 text-left">
                    {/* THE CLIPPED RANGE, not the week it opens. */}
                    {shortDate(r.from)} – {shortDate(r.to)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">
                    {r.days} {r.days === 1 ? 'day' : 'days'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {traded ? int(r.tradeCount) : DASH}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      traded ? pnlClass(r.netPnl) : 'text-fg-tertiary'
                    }`}
                  >
                    {traded ? signed(r.netPnl) : DASH}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">
                    {r.winRate !== null ? `${(r.winRate * 100).toFixed(0)}%` : DASH}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

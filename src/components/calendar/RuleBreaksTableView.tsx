import { int, money, percent, pnlClass, signed } from '@/lib/format'
import type { RuleBreaksWording } from '@shared/period-wording'
import type { RuleBreaksAnalytics } from '@shared/analytics-types'

const DASH = '—'

interface RuleBreaksTableViewProps {
  data: RuleBreaksAnalytics
  /** The period's own words, supplied by whoever mounts this tab. */
  wording: RuleBreaksWording
}

/** THE RULE-BREAKS TABLE FOR ONE PERIOD -- the week tab and the month tab
 *  render THIS, not two copies of it. The MistakesTableView precedent.
 *
 *  WHAT IT FOLLOWS: that table's structure -- toplines, then a worst-first
 *  table, then a footnote explaining why the two disagree.
 *
 *  WHAT IT DIFFERS ON, AND WHY: the grain. A mistake is tagged on a TRADE; a
 *  rule break is tagged on a DAY (journal_rule_break's primary key is (date,
 *  rule_break_def_id) and there is no trade column). So DAYS stand where that
 *  table has Trades, AVG P&L PER DAY where it has Avg P&L, and GREEN-DAY RATE
 *  where it has Win rate -- the column set RuleBreaksCard.tsx:79-83 already
 *  uses on the whole book, so a trader reads the same table in three places.
 *
 *  AND THERE IS NO AXIS GROUPING. mistake_def carries an axis column;
 *  rule_break_def is a flat list and carries none, so there is nothing to
 *  group by and the table is one body.
 *
 *  THE ROWS AND THE TOTALS ARE DIFFERENT NUMBERS ON PURPOSE. A day that broke
 *  two rules earns a row under each, so the row day-counts sum higher; the
 *  totals count the DAY, once. NOTHING HERE SUMS THE ROWS -- the headline is
 *  the rollup's own days_with_any_break, computed by counting days.
 *
 *  IT TYPES NO PERIOD NOUN. Every visible string arrives on `wording`. */
export default function RuleBreaksTableView({ data, wording }: RuleBreaksTableViewProps) {
  if (data.byRuleBreak.length === 0) {
    // AN ABSENCE, NOT ZEROS. A period in which no rule was broken has nothing
    // to report, and printing "0 days, $0.00, 0%" would dress that up as a
    // measurement. The ladder's em-dash ruling, one level up: where a row
    // shows a dash, a whole card shows a sentence.
    return <div className="text-sm text-fg-tertiary">{wording.empty}</div>
  }

  return (
    <div>
      {/* THE TOPLINES, counted once per DAY. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            {wording.headlineLabel}
          </div>
          <div className="font-mono text-sm text-fg-primary">
            {int(data.days_with_any_break)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            {wording.netLabel}
          </div>
          <div className={`font-mono text-sm font-medium ${pnlClass(data.flawed_day_net_pnl)}`}>
            {signed(data.flawed_day_net_pnl)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            {wording.cleanLabel}
          </div>
          <div className="font-mono text-sm text-fg-primary">{int(data.clean_days)}</div>
        </div>
      </div>

      <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
        {wording.tableCaption}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-fg-tertiary">
              <Th>{wording.tabLabel}</Th>
              <Th align="right">{wording.headlineLabel}</Th>
              <Th align="right">Net P&amp;L</Th>
              <Th align="right">Avg</Th>
              <Th align="right">Green rate</Th>
            </tr>
          </thead>
          <tbody>
            {data.byRuleBreak.map((r) => (
              <tr
                key={r.label}
                className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015]"
              >
                <Td>
                  <span className="rounded-sm bg-loss/[0.10] px-1.5 py-0.5 text-[10px] text-loss">
                    {r.label}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-mono text-fg-primary">{int(r.day_count)}</span>
                </Td>
                <Td align="right">
                  <span className={`font-mono font-medium ${pnlClass(r.net_pnl)}`}>
                    {signed(r.net_pnl)}
                  </span>
                </Td>
                <Td align="right">
                  {r.avg_pnl_per_day == null ? (
                    <span className="font-mono text-fg-tertiary">{DASH}</span>
                  ) : (
                    <span className={`font-mono ${pnlClass(r.avg_pnl_per_day)}`}>
                      {money(r.avg_pnl_per_day)}
                    </span>
                  )}
                </Td>
                <Td align="right">
                  {r.green_day_rate == null ? (
                    <span className="font-mono text-fg-tertiary">{DASH}</span>
                  ) : (
                    <span className="font-mono text-gold">{percent(r.green_day_rate, 0)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* THE FOOTNOTE, in the trader's own terms. Without it the two numbers
          look like an arithmetic error rather than two honest answers. */}
      <div className="mt-4 text-xs text-fg-tertiary">{wording.footnote}</div>
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

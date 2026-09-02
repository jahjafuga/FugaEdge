import { int, money, percent, pnlClass, signed } from '@/lib/format'
import type { MistakeAxis, MistakesTable } from '@shared/mistakes-types'

const DASH = '—'

// Technical first, then Psychological — the same order and the same labelled
// headers Analytics > Psychology uses (MistakesCard.tsx:17-20), with no
// per-axis colour-coding.
const AXES: { axis: MistakeAxis; label: string }[] = [
  { axis: 'technical', label: 'Technical' },
  { axis: 'psychological', label: 'Psychological' },
]

/** THE MISTAKES TABLE FOR ONE PERIOD — the day tab and the week tab render
 *  THIS, not two copies of it.
 *
 *  djsevans87 asked for the table Analytics > Psychology already had, on the
 *  daily and weekly reviews, where both tabs showed only a tag and a count.
 *  The column set, the axis grouping and the formatters are that card's, so
 *  the trader reads the same table in three places.
 *
 *  ONE DIFFERENCE FROM THAT CARD, AND IT IS DELIBERATE: an axis with no rows
 *  is OMITTED here rather than printing "No technical mistakes tagged". The
 *  card is a whole-book view, where an untouched axis is worth saying out
 *  loud; a single day or week having none is ordinary, and a line announcing
 *  it every time would be noise.
 *
 *  THE ROWS AND THE TOTALS ARE DIFFERENT NUMBERS ON PURPOSE. A trade tagged
 *  twice earns a row under each tag, so the rows count it twice; the totals
 *  count the TRADE, once. On the demo book the rows sum to +836.55 while the
 *  total reads -939.24 — opposite signs. Nothing here sums the rows. */
export default function MistakesTableView({ table }: { table: MistakesTable }) {
  if (table.rows.length === 0) {
    return (
      <div className="text-sm text-fg-tertiary">
        No mistakes tagged on any trade in this period.
      </div>
    )
  }

  return (
    <div>
      {/* THE TWO TOTALS, counted once per trade. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            Trades with a mistake
          </div>
          <div className="font-mono text-sm text-fg-primary">
            {int(table.taggedTrades)} of {int(table.periodTrades)}
            {table.taggedShare != null && (
              <span className="ml-1.5 text-fg-tertiary">({percent(table.taggedShare, 0)})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            Their net P&amp;L
          </div>
          <div className={`font-mono text-sm font-medium ${pnlClass(table.taggedNetPnl)}`}>
            {signed(table.taggedNetPnl)}
          </div>
        </div>
      </div>

      <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
        Per mistake, worst P&amp;L impact first
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
        {AXES.map(({ axis, label }) => {
          const axisRows = table.rows.filter((r) => r.axis === axis)
          // OMITTED, not announced — see the note above.
          if (axisRows.length === 0) return null
          return (
            <tbody key={axis}>
              <tr>
                <td
                  colSpan={5}
                  className="px-3 pt-5 pb-1.5 text-sm font-semibold uppercase tracking-wider text-fg-primary"
                >
                  {label}
                </td>
              </tr>
              {axisRows.map((r) => (
                <tr
                  key={`${r.axis}-${r.name}`}
                  className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015]"
                >
                  <Td>
                    <span className="rounded-sm bg-loss/[0.10] px-1.5 py-0.5 text-[10px] text-loss">
                      {r.name}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-fg-primary">{int(r.trades)}</span>
                  </Td>
                  <Td align="right">
                    <span className={`font-mono font-medium ${pnlClass(r.netPnl)}`}>
                      {signed(r.netPnl)}
                    </span>
                  </Td>
                  <Td align="right">
                    {r.avgPnl == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className={`font-mono ${pnlClass(r.avgPnl)}`}>{money(r.avgPnl)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    {r.winRate == null ? (
                      <span className="font-mono text-fg-tertiary">{DASH}</span>
                    ) : (
                      <span className="font-mono text-gold">{percent(r.winRate, 0)}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          )
        })}
      </table>

      {/* THE FOOTNOTE, in the trader's own terms. Without it the two numbers
          look like an arithmetic error rather than two honest answers. */}
      <div className="mt-4 text-xs text-fg-tertiary">
        A trade can carry more than one mistake, so it appears in a row for each one. The
        totals above count each trade once, so a trade with two mistakes sits in two rows but
        is counted once above.
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

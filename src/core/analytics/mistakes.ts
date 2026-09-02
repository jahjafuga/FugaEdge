import type {
  MistakeAxis,
  MistakeTableRow,
  MistakesTable,
} from '@shared/mistakes-types'
import type { TradeListRow } from '@shared/trades-types'
import { isWin, isLoss } from '@/core/classify/outcome'

/** THE MISTAKES TABLE FOR ONE PERIOD, from rows the caller already holds.
 *
 *  WHY THIS IS IN CORE. Analytics > Psychology has had this table since it was
 *  built, computed by computeMistakes in electron/analytics/get.ts against a
 *  file-local SQL row shape the calendar paths never see. The daily and weekly
 *  Mistakes tabs render chips instead -- a tag and a count -- because that is
 *  all their metrics carry. djsevans87 asked for the table on both. Rather
 *  than a second implementation, the arithmetic lives here, takes the SHARED
 *  TradeListRow, and both callers hand it rows they already have.
 *
 *  THE TWO TOPLINES ARE COUNTED ONCE PER TRADE, and that is the whole reason
 *  this needed writing down. The line mirrored is get.ts:454
 *
 *      flawedNet += t.net_pnl
 *
 *  which sits in that function's `hasAny` branch -- reached once per trade.
 *  The per-tag line beside it, get.ts:465 `entry.net += t.net_pnl`, runs
 *  INSIDE the tag loop and would count a two-tag trade twice. On the demo
 *  book that is nine trades, so the wrong form is measurably wrong rather
 *  than only arguably wrong.
 *
 *  THE AXIS COMES FROM mistakeTags, NEVER FROM `mistakes`. Both fields are
 *  filled by one parse at electron/trades/list.ts:306,341-342, where
 *  `mistakes` is literally `mistakeTags.map((t) => t.name)` -- the string[]
 *  cannot carry an axis, so reading it would mean inventing one. */
export function computeMistakesTable(trades: readonly TradeListRow[]): MistakesTable {
  const perTag = new Map<
    string,
    { name: string; axis: MistakeAxis; trades: number; net: number; winners: number; losers: number }
  >()
  let taggedTrades = 0
  let taggedNetPnl = 0

  for (const t of trades) {
    const tags = t.mistakeTags ?? []
    if (tags.length === 0) continue
    // ONCE PER TRADE, mirroring get.ts:454. Everything below this line is
    // per-TAG and must never touch these two.
    taggedTrades += 1
    taggedNetPnl += t.net_pnl
    for (const tag of tags) {
      // A tag is identified by its NAME AND AXIS together: the unique index on
      // mistake_def is per-(axis, name), so the same name on both axes is two
      // different mistakes and must stay two rows.
      const axis = normaliseAxis(tag.axis)
      const key = JSON.stringify([axis, tag.name])
      let entry = perTag.get(key)
      if (!entry) {
        entry = { name: tag.name, axis, trades: 0, net: 0, winners: 0, losers: 0 }
        perTag.set(key, entry)
      }
      entry.trades += 1
      entry.net += t.net_pnl
      if (isWin(t.net_pnl)) entry.winners += 1
      else if (isLoss(t.net_pnl)) entry.losers += 1
    }
  }

  const rows: MistakeTableRow[] = [...perTag.values()].map((a) => {
    const decided = a.winners + a.losers
    return {
      name: a.name,
      axis: a.axis,
      trades: a.trades,
      netPnl: a.net,
      avgPnl: a.trades > 0 ? a.net / a.trades : null,
      winRate: decided > 0 ? a.winners / decided : null,
    }
  })
  rows.sort((x, y) => x.netPnl - y.netPnl)

  const periodTrades = trades.length
  return {
    rows,
    taggedTrades,
    taggedNetPnl,
    periodTrades,
    // READ FROM THE INPUT LENGTH, not from tagged + untagged. The two are
    // always equal -- every trade is one or the other -- so adding a second
    // counter would only create something that could drift.
    taggedShare: periodTrades > 0 ? taggedTrades / periodTrades : null,
  }
}

/** MIRRORS electron/trades/list.ts:92-93, which coerces every axis that is not
 *  'psychological' to 'technical' at read time. A row from a real read can
 *  therefore never carry a third value; this exists so a hand-built fixture
 *  cannot silently invent a third group or make a tag disappear. */
function normaliseAxis(raw: MistakeAxis): MistakeAxis {
  return raw === 'psychological' ? 'psychological' : 'technical'
}

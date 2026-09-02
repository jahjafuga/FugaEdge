import { describe, expect, it } from 'vitest'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { computeWeekMetrics } from '@/core/analytics/week'
import { makeTrade } from '@/test/fixtures/trade'
import type { MistakeAxis } from '@shared/mistakes-types'
import type { TradeListRow } from '@shared/trades-types'

// WHAT THIS FILE IS FOR.
//
// The Daily and Weekly Mistakes tabs render CHIPS carrying a tag and a count,
// and nothing else. djsevans87 asked for the table Analytics > Psychology
// already has. That table's arithmetic exists, in electron/analytics/get.ts,
// against a row shape the calendar paths do not hold -- so the computation
// moves to core where both can call it.
//
// TWO NUMBERS ARE EASY TO GET WRONG AND ARE RULED HERE:
//
//   TOTAL P&L IMPACT is the net of DISTINCT trades carrying at least one tag,
//   once each. get.ts:454 does this correctly (`flawedNet += t.net_pnl`, in
//   the hasAny branch). get.ts:465 (`entry.net += t.net_pnl`) is inside the
//   per-tag loop and would count a two-tag trade twice. The demo book has
//   nine such trades, so the difference is measurable, not theoretical.
//
//   SHARE is DISTINCT tagged trades over PERIOD trades. Never tag instances
//   over trades -- the book carries 49 tag rows across 40 tagged trades.
//
// THE AXIS COMES FROM mistakeTags, never from `mistakes`. Both fields are
// populated from ONE parse at electron/trades/list.ts:306,341-342, where
// `mistakes` is literally `mistakeTags.map((t) => t.name)` -- so the
// string[] cannot carry the axis and reading it would mean inventing one.

const tagged = (
  id: number,
  net: number,
  tags: { name: string; axis: MistakeAxis }[],
): TradeListRow =>
  ({
    ...makeTrade({ id, symbol: `T${id}`, net_pnl: net }),
    mistakes: tags.map((t) => t.name),
    mistakeTags: tags,
  }) as TradeListRow

const clean = (id: number, net: number): TradeListRow =>
  ({ ...makeTrade({ id, symbol: `C${id}`, net_pnl: net }), mistakes: [], mistakeTags: [] }) as TradeListRow

const FOMO = { name: 'FOMO entry', axis: 'psychological' as MistakeAxis }
const CHASE = { name: 'Chased extended', axis: 'technical' as MistakeAxis }
const SIZE = { name: 'Sized too big', axis: 'psychological' as MistakeAxis }

describe('W the mistakes table, shared by every period', () => {
  it('W1 a TWO-TAG trade contributes its net ONCE to the P&L total', () => {
    // THE WHOLE POINT. Both tags are real and both get a row, but the trade
    // is one trade and its loss happened once.
    const t = computeMistakesTable([tagged(1, -300, [FOMO, CHASE])])
    expect(t.taggedNetPnl, 'the two-tag trade was counted twice').toBe(-300)
  })

  it('W2 and it counts ONCE toward the distinct-trade share', () => {
    const t = computeMistakesTable([tagged(1, -300, [FOMO, CHASE]), clean(2, 100)])
    expect(t.taggedTrades, 'tag instances were counted instead of trades').toBe(1)
    expect(t.periodTrades).toBe(2)
    expect(t.taggedShare).toBeCloseTo(0.5, 10)
  })

  it('W3 the per-mistake ROWS still count that trade under BOTH its tags', () => {
    // The row count and the topline count are DIFFERENT numbers and both are
    // correct. A table that made them agree would be hiding one of them.
    const t = computeMistakesTable([tagged(1, -300, [FOMO, CHASE])])
    expect(t.rows.map((r) => r.name).sort()).toEqual(['Chased extended', 'FOMO entry'])
    for (const r of t.rows) expect(r.trades, `${r.name} lost its row`).toBe(1)
    const rowSum = t.rows.reduce((n, r) => n + r.netPnl, 0)
    expect(rowSum, 'the rows should sum to DOUBLE the topline here').toBe(-600)
    expect(t.taggedNetPnl, 'the topline must not be the row sum').toBe(-300)
  })

  it('W4 rows carry the axis FROM mistakeTags, not a hardcoded list', () => {
    const t = computeMistakesTable([tagged(1, -100, [FOMO]), tagged(2, -50, [CHASE])])
    const byName = new Map(t.rows.map((r) => [r.name, r.axis]))
    expect(byName.get('FOMO entry'), 'the axis did not come from the row').toBe('psychological')
    expect(byName.get('Chased extended')).toBe('technical')
    // and a row whose ONLY source is `mistakes` cannot appear
    const legacyOnly = {
      ...makeTrade({ id: 9, symbol: 'L', net_pnl: -10 }),
      mistakes: ['Ghost tag'],
      mistakeTags: [],
    } as TradeListRow
    expect(
      computeMistakesTable([legacyOnly]).rows,
      'a tag was read from the axis-less string[]',
    ).toEqual([])
  })

  it('W5 each row carries trades, net, avg and win rate; avg is net over THAT row', () => {
    const t = computeMistakesTable([
      tagged(1, -300, [FOMO]),
      tagged(2, 100, [FOMO]),
      tagged(3, -50, [CHASE]),
    ])
    const fomo = t.rows.find((r) => r.name === 'FOMO entry')!
    expect(fomo.trades).toBe(2)
    expect(fomo.netPnl).toBe(-200)
    expect(fomo.avgPnl, 'avg is not net over this row trades').toBe(-100)
    expect(fomo.winRate, 'one winner of two decided').toBeCloseTo(0.5, 10)
  })

  it('W6 a period with no tagged trades is EMPTY and ZERO, never null and never a throw', () => {
    const t = computeMistakesTable([clean(1, 100), clean(2, -50)])
    expect(t.rows).toEqual([])
    expect(t.taggedTrades).toBe(0)
    expect(t.taggedNetPnl).toBe(0)
    expect(t.periodTrades).toBe(2)
    expect(t.taggedShare, 'an empty period should share zero, not null').toBe(0)
    // and a period with NO trades at all cannot divide by zero
    const none = computeMistakesTable([])
    expect(none.periodTrades).toBe(0)
    expect(none.taggedShare, 'zero trades must not be zero share -- there is nothing to share').toBeNull()
  })

  it('W7 the share denominator is the PERIOD trade count', () => {
    // THEY CANNOT DIFFER, and that is worth pinning rather than pretending
    // otherwise: every trade either carries a tag or does not, so
    // tagged + untagged is ALWAYS the period count. What this asserts is that
    // the denominator is read from the input length rather than reconstructed
    // by adding two counters that could drift apart.
    const rows = [tagged(1, -10, [FOMO]), tagged(2, -20, [CHASE, SIZE]), clean(3, 5), clean(4, 5)]
    const t = computeMistakesTable(rows)
    expect(t.periodTrades, 'the denominator is not the input length').toBe(rows.length)
    expect(t.taggedTrades + (t.periodTrades - t.taggedTrades)).toBe(rows.length)
    expect(t.taggedShare).toBeCloseTo(2 / 4, 10)
  })

  it('W8 CONTROL: mistakeTagCounts is byte-identical to what it was', () => {
    // THE FIELD THAT MUST NOT MOVE. whatWorkedLeaked.ts:89 reads it and feeds
    // the Edge IQ debrief, the Intelligence summary and today focus -- three
    // surfaces this ticket has nothing to do with.
    const trades = [
      tagged(1, -300, [FOMO, CHASE]),
      tagged(2, 100, [FOMO]),
      clean(3, 50),
    ]
    const m = computeWeekMetrics({
      trades,
      weekEnd: '2026-01-10',
      dailyPnl: new Map<string, number>(),
      exitDeltas: [],
    })
    expect(m.mistakeTagCounts, 'the legacy rollup changed shape or order').toEqual([
      { tag: 'FOMO entry', count: 2 },
      { tag: 'Chased extended', count: 1 },
    ])
  })

  it('W9 an unrecognised axis lands in a NAMED group, never a silent third', () => {
    // A REAL ROW CANNOT CARRY ONE: electron/trades/list.ts:92-93 coerces every
    // value that is not 'psychological' to 'technical' at read time. This is
    // defence for hand-built fixtures, and the rule is that nothing vanishes
    // and no third group appears.
    const odd = { name: 'Odd one', axis: 'sideways' as unknown as MistakeAxis }
    const t = computeMistakesTable([tagged(1, -10, [odd]), tagged(2, -20, [FOMO])])
    expect(t.rows.length, 'the odd row vanished').toBe(2)
    const axes = new Set(t.rows.map((r) => r.axis))
    expect([...axes].sort(), 'a third axis group appeared').toEqual(['psychological', 'technical'])
    expect(t.rows.find((r) => r.name === 'Odd one')!.axis).toBe('technical')
  })
})

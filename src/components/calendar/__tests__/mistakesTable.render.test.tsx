// @vitest-environment jsdom
//
// THE MISTAKES TABLE ON BOTH CALENDAR TABS (djsevans87, 30 Jul).
//
// Both tabs rendered CHIPS: a tag and a count, nothing else. The table
// Analytics > Psychology has always had — trades, net, average, win rate,
// grouped by axis — now comes from src/core/analytics/mistakes.ts, which the
// day and week metrics both call, so the two periods cannot drift.
//
// THE ROWS AND THE TOPLINE ARE TWO DIFFERENT NUMBERS AND BOTH ARE CORRECT.
// A trade carrying two tags earns a row under each, so the rows count it
// twice; the topline counts the TRADE, once. On the demo book the rows sum to
// +836.55 while the topline reads -939.24 — opposite signs. Y5 drives a
// fixture where they differ and asserts BOTH appear, because a table that
// quietly reconciled them would be the defect this ticket exists to avoid.
import { render, cleanup, screen } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'
import MistakesTab from '../DayDetailModal/MistakesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { computeDayMetrics } from '@/core/analytics/day'
import { makeTrade } from '@/test/fixtures/trade'
import type { MistakeAxis } from '@shared/mistakes-types'
import type { TradeListRow } from '@shared/trades-types'

afterEach(() => cleanup())

const tag = (name: string, axis: MistakeAxis) => ({ name, axis })
const CHASE = tag('Chased extended', 'technical')
const FOMO = tag('FOMO entry', 'psychological')

const trade = (id: number, net: number, tags: { name: string; axis: MistakeAxis }[]): TradeListRow =>
  ({
    ...makeTrade({ id, symbol: `T${id}`, net_pnl: net }),
    mistakes: tags.map((t) => t.name),
    mistakeTags: tags,
  }) as TradeListRow

/** A book where EVERY NUMBER IS DISTINCT, so no assertion can pass by
 *  coincidence. Trade 1 carries BOTH tags.
 *
 *    Chased extended  -600 + 50  = -550
 *    FOMO entry       -600 + 100 = -500
 *    rows sum                    = -1050
 *    TOPLINE (3 distinct trades) = -600 + 100 + 50 = -450
 *
 *  An earlier draft had the FOMO row land on exactly the topline, which would
 *  have let Y5 pass while reading the wrong number.
 */
const SPLIT = [
  trade(1, -600, [CHASE, FOMO]),
  trade(2, 100, [FOMO]),
  trade(3, 50, [CHASE]),
  trade(4, 10, []),
]

describe('Y the mistakes table renders on both calendar tabs', () => {
  it('Y1 the WEEK tab renders a row per tag with all five columns', () => {
    render(<WeekMistakesTab table={computeMistakesTable(SPLIT)} wording={WEEK_WORDING} />)
    for (const h of ['Mistake', 'Trades', 'Net P&L', 'Avg P&L', 'Win rate']) {
      expect(screen.getByText(h), `the ${h} column is missing`).toBeTruthy()
    }
    expect(screen.getByText('Chased extended')).toBeTruthy()
    expect(screen.getByText('FOMO entry')).toBeTruthy()
  })

  it('Y1b each row TRADES cell is that row own count, not the topline', () => {
    // FOUND BY A PLANT THAT REDDENED NOTHING. Z4 fed the Trades column from
    // table.taggedTrades, so every row read 3 instead of its own 2, and not one
    // case looked at that cell. Y1 asserted the column HEADER existed; nothing
    // asserted the number under it.
    //
    // The fixture makes the two numbers different on purpose: each tag is on
    // TWO trades while THREE trades carry a tag, so a row showing the topline
    // is visibly wrong.
    const t = computeMistakesTable(SPLIT)
    const { container } = render(<WeekMistakesTab table={t} wording={WEEK_WORDING} />)
    for (const r of t.rows) {
      const row = [...container.querySelectorAll('tr')].find(
        (el) => el.textContent?.includes(r.name),
      )
      expect(row, `no row rendered for ${r.name}`).toBeTruthy()
      const cells = [...row!.querySelectorAll('td')].map((c) => c.textContent?.trim())
      expect(cells[1], `${r.name} shows the wrong trade count`).toBe(String(r.trades))
    }
    // and the topline is a DIFFERENT number, or this case proves nothing
    expect(t.rows.every((r) => r.trades !== t.taggedTrades), 'the fixture stopped discriminating').toBe(true)
  })

  it('Y2 the DAY tab renders the same table', () => {
    render(<MistakesTab table={computeMistakesTable(SPLIT)} />)
    for (const h of ['Mistake', 'Trades', 'Net P&L', 'Avg P&L', 'Win rate']) {
      expect(screen.getByText(h), `the ${h} column is missing`).toBeTruthy()
    }
    expect(screen.getByText('Chased extended')).toBeTruthy()
  })

  it('Y3 axis headings appear technical first, and an EMPTY axis renders none', () => {
    const { container } = render(<WeekMistakesTab table={computeMistakesTable(SPLIT)} wording={WEEK_WORDING} />)
    const text = container.textContent!
    const tIdx = text.indexOf('Technical')
    const pIdx = text.indexOf('Psychological')
    expect(tIdx, 'the Technical heading is missing').toBeGreaterThanOrEqual(0)
    expect(pIdx, 'the Psychological heading is missing').toBeGreaterThanOrEqual(0)
    expect(tIdx, 'psychological was rendered before technical').toBeLessThan(pIdx)
    cleanup()
    // ONE AXIS ONLY. MistakesCard prints "No technical mistakes tagged" for an
    // empty axis because it is a whole-book view where the absence is news. On
    // a single day or week an empty axis is ordinary, so it is omitted — and
    // that difference is asserted rather than assumed.
    const onlyPsych = render(<WeekMistakesTab table={computeMistakesTable([trade(9, -5, [FOMO])])} wording={WEEK_WORDING} />)
    const t2 = onlyPsych.container.textContent!
    expect(t2).toContain('Psychological')
    expect(t2, 'an empty axis printed a heading anyway').not.toContain('Technical')
  })

  it('Y4 both toplines render: distinct tagged trades, and the share', () => {
    const { container } = render(<WeekMistakesTab table={computeMistakesTable(SPLIT)} wording={WEEK_WORDING} />)
    const text = container.textContent!.replace(/\s+/g, ' ')
    // three of four trades carry a tag
    expect(text, 'the tagged-trade count is missing').toMatch(/3 of 4/)
    expect(text, 'the share is missing').toMatch(/75%/)
  })

  it('Y5 the topline P&L is the MODULE number, never the sum of the rows', () => {
    // THE WHOLE POINT OF THE TICKET. Rows sum to -1050; the topline is -450,
    // because the trade carrying two tags is ONE trade. Every value below is
    // distinct, so none of these assertions can pass on the wrong number.
    const t = computeMistakesTable(SPLIT)
    const rowSum = t.rows.reduce((n, r) => n + r.netPnl, 0)
    expect(rowSum, 'the fixture stopped separating the two numbers').toBe(-1050)
    expect(t.taggedNetPnl, 'the module topline moved').toBe(-450)
    expect(rowSum).not.toBe(t.taggedNetPnl)
    const { container } = render(<WeekMistakesTab table={t} wording={WEEK_WORDING} />)
    const text = container.textContent!.replace(/\s+/g, ' ')
    // the TOPLINE value, and NOT the row sum
    expect(text, 'the topline P&L is missing').toContain('-$450.00')
    expect(text, 'the table printed the ROW SUM as the topline').not.toContain('1,050')
    // and each row still carries its own net
    expect(text, 'the Chased extended row lost its net').toContain('-$550.00')
    expect(text, 'the FOMO row lost its net').toContain('-$500.00')
  })

  it('Y6 a period with NO tagged trades renders an empty state, not zeros', () => {
    const empty = computeMistakesTable([trade(1, 50, []), trade(2, -10, [])])
    const { container } = render(<WeekMistakesTab table={empty} wording={WEEK_WORDING} />)
    const text = container.textContent!
    expect(text.toLowerCase(), 'no empty state').toMatch(/no mistakes/)
    expect(text, 'an empty period printed a table header anyway').not.toContain('Win rate')
  })

  it('Y7 CONTROL: the CHIP markup is gone from both tabs', () => {
    // The old rendering was a rounded-full pill carrying the tag and a
    // multiplication sign with the count. Neither tab may still produce one.
    const t = computeMistakesTable(SPLIT)
    const w = render(<WeekMistakesTab table={t} wording={WEEK_WORDING} />)
    expect(w.container.querySelectorAll('.rounded-full').length, 'a chip survives on the week tab').toBe(0)
    expect(w.container.textContent, 'the chip count marker survives').not.toContain(String.fromCharCode(215))
    cleanup()
    const d = render(<MistakesTab table={t} />)
    expect(d.container.querySelectorAll('.rounded-full').length, 'a chip survives on the day tab').toBe(0)
    expect(d.container.textContent, 'the chip count marker survives').not.toContain(String.fromCharCode(215))
  })

  it('AA1 no customer-facing string carries the em dash byte', () => {
    // BY BYTE, never a character class. U+2014 encodes to e2 80 94.
    //
    // THE FIXTURE HAS NO NULL CELLS ON PURPOSE. The em dash IS used as a
    // rendering glyph for a missing average or win rate -- the same glyph
    // MistakesCard.tsx:12 has shipped for as long as that card has existed --
    // and that is not copy. With nothing null, the glyph never renders, so any
    // em dash left in the output is a sentence rather than a placeholder.
    const t = computeMistakesTable(SPLIT)
    expect(
      t.rows.every((r) => r.avgPnl !== null && r.winRate !== null),
      'the fixture grew a null cell, so this case can no longer tell copy from glyph',
    ).toBe(true)
    const { container } = render(<WeekMistakesTab table={t} wording={WEEK_WORDING} />)
    expect(
      container.textContent,
      'an em dash survives in customer-facing copy',
    ).not.toContain(String.fromCharCode(0x2014))
  })

  it('AA1b CONTROL: the glyph DOES still render for a null cell', () => {
    // Without this, AA1 would also pass on a component that had stopped
    // rendering the placeholder at all.
    const table = {
      rows: [{ name: 'Solo', axis: 'technical' as const, trades: 1, netPnl: 0, avgPnl: null, winRate: null }],
      taggedTrades: 1, taggedNetPnl: 0, periodTrades: 1, taggedShare: 1,
    }
    const { container } = render(<WeekMistakesTab table={table} wording={WEEK_WORDING} />)
    expect(
      container.textContent,
      'the null placeholder stopped rendering',
    ).toContain(String.fromCharCode(0x2014))
  })

  it('AA2 the footnote does not claim the rows fail to add up', () => {
    // The first wording said the rows "do not add up to them", which reads as
    // an admission of an arithmetic error. Both numbers are correct; they
    // answer different questions. Asserted on the ABSENCE of that claim rather
    // than on the whole sentence, so the wording can still be improved.
    const { container } = render(<WeekMistakesTab table={computeMistakesTable(SPLIT)} wording={WEEK_WORDING} />)
    const text = container.textContent!.toLowerCase().replace(/\s+/g, ' ')
    expect(text, 'the footnote still says the rows do not add up').not.toContain('do not add up')
    expect(text).not.toContain('does not add up')
    expect(text).not.toContain('add up to them')
  })

  it('AA3 the footnote IS there and DOES explain multi-tagging', () => {
    // An empty footnote would sail through AA2. This is what stops that.
    const { container } = render(<WeekMistakesTab table={computeMistakesTable(SPLIT)} wording={WEEK_WORDING} />)
    const text = container.textContent!.toLowerCase().replace(/\s+/g, ' ')
    expect(text, 'the footnote is missing').toContain('more than one mistake')
    expect(text, 'the footnote does not say the totals count each trade once').toContain('once')
  })

  it('Y8 CONTROL: mistakeTagCounts is STILL on the metrics, still its old shape', () => {
    // whatWorkedLeaked.ts reads this for three surfaces outside the ticket.
    // The tabs stopped rendering it; nothing stopped computing it.
    const m = computeDayMetrics({ date: '2026-06-10', trades: SPLIT, exitDeltas: [] })
    expect(m.mistakeTagCounts, 'the legacy rollup changed or vanished').toEqual([
      { tag: 'Chased extended', count: 2 },
      { tag: 'FOMO entry', count: 2 },
    ])
  })
})

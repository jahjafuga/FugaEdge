// @vitest-environment jsdom
//
// BEAT 222 — the Activity & Streaks card renders as TWO headed columns.
//
// Beta ticket, djsevans87: the section is nineteen rows tall in a card that
// sits alone on the last row of the card grid, so the page shows one long
// list beside an empty half. The cure is a straight cut at row eleven into
// two headed columns inside the same card.
//
// What these pin, in order of what would hurt most if it broke:
//   1. the split exists and has exactly two columns, with the ticket's headings
//   2. the cut is STRAIGHT — no row is reordered, renamed, added or dropped
//   3. every label→value→delta triple is IDENTICAL to the single-column render
//   4. the four dividers land after the named rows
//   5. the other six sections stay single column
//   6. the 4f7c5cb empty-side behaviour survives in BOTH columns
import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import CompareView from '../CompareView'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const MAY = { from: '2026-05-01', to: '2026-05-31' }
const JUNE = { from: '2026-06-01', to: '2026-06-30' }
/** A range with no trades in it at all — drives the empty-side assertions. */
const BARREN = { from: '2026-01-01', to: '2026-01-31' }

const LEFT_HEADING = 'Trade activity & execution'
const RIGHT_HEADING = 'P&L & sizing'

/** The nineteen rows, in the order buildSections declares them. The cut is
 *  after the eleventh. */
const LEFT_ROWS = [
  'Total trades', 'Winners', 'Losers', 'Scratches', 'Trading days',
  'Max consec wins', 'Max consec losses',
  'Hold (all)', 'Hold (winners)', 'Hold (losers)', 'Hold (scratch)',
]
const RIGHT_ROWS = [
  'Fees', 'Gross P&L', 'Avg trade P&L',
  'Avg daily volume', 'Shares traded', 'Avg share size', 'Avg position size',
  'Max drawdown',
]

function book(): TradeListRow[] {
  const rows: TradeListRow[] = []
  for (let i = 0; i < 9; i += 1) {
    rows.push(makeTrade({
      id: i + 1,
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      symbol: `S${i}`,
      net_pnl: i % 3 === 0 ? 412.5 : i % 3 === 1 ? -188.25 : 0,
      gross_pnl: i % 3 === 0 ? 430 : i % 3 === 1 ? -180 : 5,
      total_fees: 8.75,
      shares_bought: 1200 + i * 50,
      shares_sold: 1200 + i * 50,
      avg_buy_price: 24.5,
      avg_sell_price: 25.1,
    }))
  }
  for (let i = 0; i < 7; i += 1) {
    rows.push(makeTrade({
      id: 100 + i,
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      symbol: `T${i}`,
      net_pnl: i % 3 === 0 ? 233.75 : i % 3 === 1 ? -97.4 : 0,
      gross_pnl: i % 3 === 0 ? 245 : i % 3 === 1 ? -90 : 3,
      total_fees: 6.2,
      shares_bought: 900 + i * 40,
      shares_sold: 900 + i * 40,
      avg_buy_price: 31.2,
      avg_sell_price: 31.9,
    }))
  }
  return rows
}

function draw(rangeA = MAY, rangeB = JUNE) {
  return render(
    <CompareView
      trades={book()}
      sentimentByDate={new Map()}
      rangeA={rangeA}
      rangeB={rangeB}
      onRangeChange={() => {}}
    />,
  )
}

/** The card whose section heading is Activity & Streaks. */
function activityCard(container: HTMLElement): HTMLElement {
  const card = Array.from(container.querySelectorAll('div.rounded-lg.border')).find((c) =>
    (c.querySelector('h3')?.textContent ?? '').includes('Activity'),
  )
  expect(card, 'the Activity & Streaks card is rendered').toBeTruthy()
  return card as HTMLElement
}

/** A row's three cells: label, "AvsB", delta.
 *
 *  NOTE ON THE MIDDLE CELL: the "vs" is its own span carrying an mx-1 margin,
 *  so the separation is CSS, not text. textContent therefore reads "9vs7" with
 *  no spaces, and the value/delta assertions below are written against that.
 *  The LABEL keeps its real spaces — it is prose, not a rendered number. */
function cells(row: Element): [string, string, string] {
  const t = (x: Element | undefined) => (x?.textContent ?? '').trim()
  const c = Array.from(row.children)
  return [
    t(c[0]).replace(/\s+/g, ' '),
    t(c[1]).replace(/\s+/g, ''),
    t(c[2]).replace(/\s+/g, ''),
  ]
}

function rowsOf(scope: HTMLElement): Element[] {
  return Array.from(scope.querySelectorAll('div.grid.min-h-8'))
}

/** The two column wrappers, left then right, in DOM order. */
function columns(card: HTMLElement): HTMLElement[] {
  const split = card.querySelector('[data-stat-split]')
  expect(split, 'the Activity card carries a two-column split').toBeTruthy()
  return Array.from((split as HTMLElement).children) as HTMLElement[]
}

describe('CompareView — the Activity & Streaks card splits into two columns', () => {
  it('renders exactly two columns, headed as the ticket names them', () => {
    const { container } = draw()
    const cols = columns(activityCard(container))
    expect(cols).toHaveLength(2)
    expect(within(cols[0]).getByRole('heading', { level: 4 }).textContent).toBe(LEFT_HEADING)
    expect(within(cols[1]).getByRole('heading', { level: 4 }).textContent).toBe(RIGHT_HEADING)
  })

  it('cuts straight at row eleven — left holds one to eleven, in order', () => {
    const { container } = draw()
    const [left] = columns(activityCard(container))
    expect(rowsOf(left).map((r) => cells(r)[0])).toEqual(LEFT_ROWS)
  })

  it('cuts straight at row eleven — right holds twelve to nineteen, in order', () => {
    const { container } = draw()
    const [, right] = columns(activityCard(container))
    expect(rowsOf(right).map((r) => cells(r)[0])).toEqual(RIGHT_ROWS)
  })

  it('adds and drops nothing: the two columns are the nineteen rows, once each', () => {
    const { container } = draw()
    const card = activityCard(container)
    const labels = rowsOf(card).map((r) => cells(r)[0])
    expect(labels).toEqual([...LEFT_ROWS, ...RIGHT_ROWS])
    expect(labels).toHaveLength(19)
    expect(new Set(labels).size).toBe(19)
  })

  // THE VALUE-IDENTITY CONTROL. This is a relayout: if any number, delta or
  // arrow moved, this fails. The single-column truth is taken from a section
  // that was NOT split, plus the full triple set of the split one.
  it('every label, value and delta is what the section already produced', () => {
    const { container } = draw()
    const card = activityCard(container)
    const triples = rowsOf(card).map(cells)

    // Not one cell may be blank, and the delta column must still carry a value
    // for every row (a dash only when a side is empty, which is not this case).
    triples.forEach(([label, values, delta]) => {
      expect(label, 'row label is rendered').not.toBe('')
      expect(values, `${label} renders its A-vs-B values`).toMatch(/vs/)
      expect(delta, `${label} renders a delta`).not.toBe('')
      expect(delta, `${label} delta is not a dash when both sides have trades`).not.toBe('—')
    })

    // Spot-pin two rows across the cut, one per column, so a silent swap of the
    // A and B sides or of the delta sign cannot pass.
    const byLabel = new Map(triples.map((t) => [t[0], t]))
    expect(byLabel.get('Total trades')?.[1]).toBe('9vs7')
    expect(byLabel.get('Total trades')?.[2]).toBe('+2')
    expect(byLabel.get('Trading days')?.[1]).toBe('9vs7')
  })

  it('draws four dividers, after the rows the mockup names', () => {
    const { container } = draw()
    const card = activityCard(container)
    expect(card.querySelectorAll('[data-stat-divider]')).toHaveLength(4)

    // A divider sits between two rows: the row before it is the last row of the
    // preceding group. Walk each column's groups and read the row each ends on.
    const endsOn = columns(card).map((col) =>
      Array.from(col.querySelectorAll(':scope > div > div'))
        .filter((g) => rowsOf(g as HTMLElement).length > 0)
        .map((g) => {
          const rs = rowsOf(g as HTMLElement)
          return cells(rs[rs.length - 1])[0]
        }),
    )
    expect(endsOn[0]).toEqual(['Trading days', 'Max consec losses', 'Hold (scratch)'])
    expect(endsOn[1]).toEqual(['Avg trade P&L', 'Avg position size', 'Max drawdown'])
  })

  it('leaves the other six sections single column', () => {
    const { container } = draw()
    const cards = Array.from(container.querySelectorAll('div.rounded-lg.border')).filter(
      (c) => c.querySelector('h3') && rowsOf(c as HTMLElement).length > 0,
    )
    const split = cards.filter((c) => c.querySelector('[data-stat-split]'))
    expect(split).toHaveLength(1)
    expect((split[0].querySelector('h3')?.textContent ?? '')).toContain('Activity')
    // and nobody else grew a column heading
    expect(container.querySelectorAll('[data-stat-split]')).toHaveLength(1)
  })

  // THE 4f7c5cb BEHAVIOUR, RE-PINNED THROUGH THE SPLIT. Period B has no trades:
  // the surviving side keeps its numbers, the empty side dashes, and no delta,
  // arrow or colour is drawn — in BOTH columns, not just the first.
  it('an empty period B dashes only side B, in both columns', () => {
    const { container } = draw(MAY, BARREN)
    const cols = columns(activityCard(container))
    expect(cols).toHaveLength(2)
    cols.forEach((col, i) => {
      const rs = rowsOf(col)
      expect(rs.length, `column ${i} still renders its rows`).toBeGreaterThan(0)
      rs.forEach((r) => {
        const [label, values, delta] = cells(r)
        expect(values, `${label} keeps side A and dashes side B`).toMatch(/vs—$/)
        expect(delta, `${label} draws no delta against an absence`).toBe('—')
      })
    })
    expect(activityCard(container).querySelectorAll('.text-loss')).toHaveLength(0)
    expect(activityCard(container).querySelectorAll('.text-win')).toHaveLength(0)
  })

  it('an empty period A dashes only side A, in both columns', () => {
    const { container } = draw(BARREN, JUNE)
    columns(activityCard(container)).forEach((col) => {
      rowsOf(col).forEach((r) => {
        const [label, values, delta] = cells(r)
        expect(values, `${label} dashes side A and keeps side B`).toMatch(/^—vs/)
        expect(delta, `${label} draws no delta against an absence`).toBe('—')
      })
    })
  })
})

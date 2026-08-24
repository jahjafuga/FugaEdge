// @vitest-environment jsdom
//
// v0.2.7 -- THE TRADES BEHIND A SETUP. The panel half.
//
// FOUNDER RULINGS these guards enforce:
//   Cap EIGHT rows, then a "Show all N" affordance -- the BucketTradeTable
//     interaction shape, which this surface borrows rather than reinvents.
//   Columns are date, symbol, side, shares, entry, exit, net P&L. The Playbook
//     column is DROPPED: inside a playbook's own panel every row is that setup,
//     so the column would be a constant, and a constant column is a column that
//     costs width and says nothing.
//   An empty setup renders ONE QUIET LINE, not silence. This differs from the
//     year grid's month tier on purpose: a month tile is one of twelve on a
//     surface the user is scanning, so silence is right there. A setup panel is
//     a DESTINATION the user deliberately opened -- silence there reads as a
//     bug, not as an answer.

import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import PlaybookTradesCard from '../PlaybookTradesCard'

afterEach(() => cleanup())

/** N trades under one setup, each on its own day so the date column varies. */
function trades(n: number): TradeListRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      id: i + 1,
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      symbol: `SYM${i}`,
      net_pnl: i % 2 === 0 ? 120 + i : -80 - i,
      playbook_id: 7,
      playbook_name: 'Micro Pullback',
      playbook_tier: 'A',
    }),
  )
}

const mount = (rows: TradeListRow[]) =>
  render(<PlaybookTradesCard trades={rows} setupName="Micro Pullback" />)

const bodyRows = (c: HTMLElement) => c.querySelectorAll('tbody tr')
const emptyLine = (c: HTMLElement) => c.querySelectorAll('[data-playbook-trades-empty]')

// --- G5 ---------------------------------------------------------------------

describe('G5 the list caps at eight, and the affordance tells the truth', () => {
  it('renders at most eight rows for a setup with twenty-nine trades', () => {
    const { container } = mount(trades(29))
    expect(bodyRows(container).length, 'the eight-row cap is not holding').toBe(8)
  })

  it('the affordance names the TRUE total, not the visible count', () => {
    mount(trades(29))
    expect(screen.getByRole('button', { name: /show all 29/i })).toBeTruthy()
  })

  it('clicking it reveals every row, and the affordance flips back', () => {
    const { container } = mount(trades(29))
    fireEvent.click(screen.getByRole('button', { name: /show all 29/i }))
    expect(bodyRows(container).length).toBe(29)
    expect(screen.getByRole('button', { name: /show first 8/i })).toBeTruthy()
  })

  it('exactly eight trades render uncapped with NO affordance -- the boundary', () => {
    const { container } = mount(trades(8))
    expect(bodyRows(container).length).toBe(8)
    expect(
      screen.queryByRole('button', { name: /show all/i }),
      'an affordance appeared with nothing hidden behind it',
    ).toBeNull()
  })

  it('a small setup renders all its rows and no affordance', () => {
    const { container } = mount(trades(3))
    expect(bodyRows(container).length).toBe(3)
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })
})

// --- G2 / G3 ----------------------------------------------------------------

describe('G2 the list is self-contained -- it scrolls inside its own box', () => {
  // STRUCTURAL ONLY, and saying so out loud: jsdom has no layout engine, so
  // nothing here proves a pixel height or that anything actually scrolls. What
  // it pins is that the containment classes are on the scroll box and stay
  // there. The real acceptance instrument is a click in the running app.
  //
  // The height is NOT a new number: it is the same max-h-[600px] the playbook
  // list on this page already uses (src/pages/Playbook.tsx:288), reused so the
  // two scroll regions in the same view cannot disagree.
  const scrollBox = (c: HTMLElement) =>
    c.querySelector('[data-playbook-trades-scroll]') as HTMLElement | null

  it('the scroll box exists', () => {
    const { container } = mount(trades(29))
    expect(scrollBox(container), 'there is no dedicated scroll box').toBeTruthy()
  })

  it('it carries the reused max height and vertical overflow', () => {
    const { container } = mount(trades(29))
    const cls = scrollBox(container)!.className
    expect(cls, 'the reused max-height is missing').toMatch(/max-h-\[600px\]/)
    expect(cls, 'the vertical overflow is missing').toMatch(/overflow-y-auto/)
  })

  it('the containment is NOT on the Card -- the header must not scroll away', () => {
    const { container } = mount(trades(29))
    const card = container.querySelector('[data-playbook-trades]') as HTMLElement
    expect(
      card.className,
      'the Card itself scrolls, which takes the header with it',
    ).not.toMatch(/overflow-y-auto/)
    expect(card.className).not.toMatch(/max-h-\[600px\]/)
  })

  it('the affordance sits OUTSIDE the scroll box, so it stays reachable', () => {
    const { container } = mount(trades(29))
    const btn = screen.getByRole('button', { name: /show all 29/i })
    expect(
      scrollBox(container)!.contains(btn),
      'the expander scrolled away with the rows',
    ).toBe(false)
  })
})

describe('G3 containment holds in BOTH states, not just when expanded', () => {
  const clsOf = (c: HTMLElement) =>
    (c.querySelector('[data-playbook-trades-scroll]') as HTMLElement).className

  it('collapsed: the classes are already there', () => {
    const { container } = mount(trades(29))
    expect(clsOf(container)).toMatch(/max-h-\[600px\]/)
    expect(clsOf(container)).toMatch(/overflow-y-auto/)
  })

  it('expanded: the SAME classes, unchanged -- no conditional geometry', () => {
    const { container } = mount(trades(29))
    const before = clsOf(container)
    fireEvent.click(screen.getByRole('button', { name: /show all 29/i }))
    expect(
      clsOf(container),
      'the geometry changed on expand -- it must be one class set',
    ).toBe(before)
  })

  it('a SHORT list is contained too -- containment is unconditional', () => {
    const { container } = mount(trades(3))
    expect(clsOf(container)).toMatch(/max-h-\[600px\]/)
    expect(clsOf(container)).toMatch(/overflow-y-auto/)
  })
})

// --- G6 ---------------------------------------------------------------------

describe('G6 an untagged setup says so, once', () => {
  it('renders the empty line ELEMENT -- absence of rows is not the answer here', () => {
    const { container } = mount([])
    expect(
      emptyLine(container).length,
      'a setup with no trades rendered nothing at all',
    ).toBe(1)
  })

  it('and renders no table rows alongside it', () => {
    const { container } = mount([])
    expect(bodyRows(container).length).toBe(0)
  })

  it('a setup WITH trades never renders the empty line', () => {
    const { container } = mount(trades(2))
    expect(emptyLine(container).length).toBe(0)
  })

  it('the empty line carries no affordance', () => {
    mount([])
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 no Playbook column inside a playbook panel', () => {
  it('no column header names the playbook', () => {
    const { container } = mount(trades(3))
    const heads = [...container.querySelectorAll('thead th')].map(
      (th) => th.textContent ?? '',
    )
    expect(
      heads.some((h) => /playbook|setup/i.test(h)),
      `a redundant setup column is rendered: ${heads.join(' | ')}`,
    ).toBe(false)
  })

  it('the ruled seven columns are the columns', () => {
    const { container } = mount(trades(3))
    const heads = [...container.querySelectorAll('thead th')].map((th) =>
      (th.textContent ?? '').trim().toLowerCase(),
    )
    expect(heads).toHaveLength(7)
    for (const want of ['date', 'symbol', 'side', 'shares', 'entry', 'exit']) {
      expect(heads.some((h) => h.includes(want)), `no ${want} column`).toBe(true)
    }
    expect(heads.some((h) => h.includes('net')), 'no net P&L column').toBe(true)
  })

  it('the setup name never repeats down the rows', () => {
    const { container } = mount(trades(3))
    const body = container.querySelector('tbody')!
    expect(
      within(body).queryAllByText('Micro Pullback').length,
      'the setup name is repeated on every row',
    ).toBe(0)
  })
})

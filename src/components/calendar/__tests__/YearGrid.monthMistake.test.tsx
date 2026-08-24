// @vitest-environment jsdom
// v0.2.7 -- THE MONTH TILE SHOWS WHAT KEPT GOING WRONG.
//
// FOUNDER RULINGS these guards enforce:
//   ONE line per tile. It fits the measured nineteen-pixel slack between the
//   tile's content height and its min-height, so the tile must NOT grow.
//   EMPTY MONTHS RENDER NOTHING -- no placeholder, no "no mistakes" text. On a
//   real book most tiles are empty, and twelve apologies is not a year view.
//
// jsdom has no layout engine, so height cannot be asserted here. These pin the
// STRUCTURE that the costed arithmetic depends on: one element, the costed
// classes, no second line, no gap class. Detect by structure, not by text.

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CalendarYear, CalendarYearMonth } from '@shared/calendar-types'
import YearGrid from '../YearGrid'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve(null) }),
}))
vi.mock('../YearCumulativeChart', () => ({ default: () => null }))

const month = (m: number, over: Partial<CalendarYearMonth> = {}): CalendarYearMonth => ({
  year: 2026,
  month: m,
  net_pnl: 100,
  gross_pnl: 120,
  total_fees: 20,
  trade_count: 10,
  winners: 6,
  losers: 4,
  trading_days: 5,
  avg_winner: 30,
  avg_loser: -20,
  top_mistake: null,
  ...over,
} as CalendarYearMonth)

/** March carries a mistake; April carries a long one; May is traded but
 *  untagged; June never traded. */
const YEAR: CalendarYear = {
  year: 2026,
  months: [
    month(1), month(2),
    month(3, { top_mistake: { name: 'Chased extended', count: 58 } }),
    month(4, {
      top_mistake: {
        name: 'Chased extension (too far from 9 EMA) and then averaged down',
        count: 4,
      },
    }),
    month(5),
    month(6, { trade_count: 0, winners: 0, losers: 0, net_pnl: 0, avg_winner: null, avg_loser: null }),
    month(7), month(8), month(9), month(10), month(11), month(12),
  ],
  range: { earliest: '2026-01-01', latest: '2026-12-31', monthsWithTrades: [] },
} as unknown as CalendarYear

function mount() {
  return render(
    <YearGrid
      data={YEAR}
      year={2026}
      realNow={{ y: 2026, m: 8 }}
      onSelectMonth={() => {}}
      onPrevYear={() => {}}
      onNextYear={() => {}}
    />,
  )
}

const tile = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') })
const tierOf = (el: HTMLElement) => el.querySelectorAll('[data-month-mistake]')

// --- G6 ---------------------------------------------------------------------

describe('G6 a month with no tagged trades renders NO tier element at all', () => {
  it('the traded-but-untagged month has no mistake element -- absence, not empty text', () => {
    mount()
    expect(tierOf(tile('May')).length, 'an untagged month rendered a tier').toBe(0)
  })

  it('the never-traded month has none either', () => {
    mount()
    expect(tierOf(tile('Jun')).length).toBe(0)
  })

  it('and no placeholder copy leaks anywhere on the grid', () => {
    const { container } = mount()
    expect(container.textContent ?? '').not.toMatch(/no mistakes|none tagged|no tags/i)
  })
})

// --- G7 ---------------------------------------------------------------------

describe('G7 exactly ONE tier line, in the costed idiom', () => {
  it('the tagged month renders exactly one mistake element', () => {
    mount()
    expect(tierOf(tile('Mar')).length, 'the tile grew a second line').toBe(1)
  })

  it('it wears the costed classes -- pt-1.5 and the nine-pixel text', () => {
    mount()
    const line = tierOf(tile('Mar'))[0] as HTMLElement
    const cls = line.className
    expect(cls, 'the costed top padding is missing').toMatch(/\bpt-1\.5\b/)
    expect(cls, 'the costed nine-pixel text class is missing').toMatch(/text-\[9px\]/)
  })

  it('and carries NO gap class -- a gap only exists between two lines', () => {
    mount()
    const line = tierOf(tile('Mar'))[0] as HTMLElement
    expect(line.className, 'a gap class implies a second line was planned').not.toMatch(/\bgap-/)
  })

  it('across the whole grid, no tile ever renders more than one', () => {
    const { container } = mount()
    for (const btn of container.querySelectorAll('button')) {
      expect(btn.querySelectorAll('[data-month-mistake]').length).toBeLessThanOrEqual(1)
    }
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 a long name truncates and keeps its tooltip', () => {
  it('the name span truncates', () => {
    mount()
    const line = tierOf(tile('Apr'))[0] as HTMLElement
    const nameSpan = line.querySelector('span.truncate')
    expect(nameSpan, 'the long name has no truncate class').toBeTruthy()
  })

  it('the tooltip carries the full name and the count', () => {
    mount()
    const line = tierOf(tile('Apr'))[0] as HTMLElement
    const title = line.getAttribute('title') ?? ''
    expect(title).toContain('Chased extension (too far from 9 EMA) and then averaged down')
    expect(title, 'the count is not in the tooltip').toMatch(/4/)
  })

  it('the visible text is the name -- the count lives in the tooltip only', () => {
    mount()
    const line = tierOf(tile('Mar'))[0] as HTMLElement
    expect(within(line).getByText('Chased extended')).toBeTruthy()
  })
})

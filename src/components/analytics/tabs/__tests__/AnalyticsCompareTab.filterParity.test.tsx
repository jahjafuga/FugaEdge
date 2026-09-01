// @vitest-environment jsdom
//
// BEAT 224 — Compare gets the full filter bar, minus the date range.
//
// Beat 219 measured the cost of the reservation: Compare received raw rows and
// called applyFilters with emptyFilters() plus mistakes, so six of the seven
// dimensions in OverviewFilters were unreachable from this tab. This pins the
// delivery.
//
// What these pin, in order of what would hurt most if it broke:
//   1. the bar renders, with every control Overview has EXCEPT the date range
//   2. each control narrows the rows BOTH periods compute from
//   3. the period pickers are untouched — the collision the design avoids
//   4. the mistake control still works exactly as before (Dave's ticket)
//   5. a filter that empties ONE period triggers the empty-side rule
//   6. the growth gate fires for ANY active filter, not just mistakes
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import AnalyticsCompareTab from '../AnalyticsCompareTab'

vi.mock('@/lib/ipc', () => ({
  ipc: { sessionListAll: () => Promise.resolve([]) },
}))
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const MAY = { from: '2026-05-01', to: '2026-05-31' }
const JUNE = { from: '2026-06-01', to: '2026-06-30' }

/** A book where the two periods are DELIBERATELY separable by every dimension,
 *  so "did this control narrow both periods" has a known answer.
 *
 *  MAY  : 4 long AAAA trades, playbook Alpha, catalyst News, no mistakes
 *  JUNE : 3 short BBBB trades, playbook Beta, catalyst Earnings, mistake Chased
 *
 *  So filtering to side=short empties MAY. Filtering to mistake Chased empties
 *  MAY. Filtering to symbol AAAA empties JUNE. That is what makes the
 *  empty-side assertions below meaningful rather than incidental. */
function book(): TradeListRow[] {
  const rows: TradeListRow[] = []
  for (let i = 0; i < 4; i += 1) {
    rows.push(makeTrade({
      id: i + 1,
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      symbol: 'AAAA',
      side: 'long',
      playbook_name: 'Alpha',
      catalyst_type: 'News',
      mistakes: [],
      net_pnl: 100 + i,
      gross_pnl: 110 + i,
    }))
  }
  for (let i = 0; i < 3; i += 1) {
    rows.push(makeTrade({
      id: 100 + i,
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      symbol: 'BBBB',
      side: 'short',
      playbook_name: 'Beta',
      catalyst_type: 'Earnings',
      mistakes: ['Chased'],
      net_pnl: -50 - i,
      gross_pnl: -45 - i,
    }))
  }
  return rows
}

function draw() {
  return render(<AnalyticsCompareTab trades={book()} initialRangeA={MAY} initialRangeB={JUNE} />)
}

/** The Activity card's "Total trades" row, as "AvsB". The vs is a span with an
 *  mx-1 margin, so textContent carries no spaces. */
function totalTrades(container: HTMLElement): string {
  const row = Array.from(container.querySelectorAll('div.grid.min-h-8')).find(
    (r) => (r.children[0]?.textContent ?? '').trim() === 'Total trades',
  )
  expect(row, 'the Total trades row is rendered').toBeTruthy()
  return (row!.children[1]?.textContent ?? '').replace(/\s+/g, '')
}

function deltaOf(container: HTMLElement, label: string): string {
  const row = Array.from(container.querySelectorAll('div.grid.min-h-8')).find(
    (r) => (r.children[0]?.textContent ?? '').trim() === label,
  )
  return (row?.children[2]?.textContent ?? '').replace(/\s+/g, '')
}

describe('AnalyticsCompareTab — the full filter bar', () => {
  it('renders the bar with Overview controls and NO date range', async () => {
    const { container } = draw()
    // Present: the search field, the side segment, the More expander.
    expect(screen.getByPlaceholderText(/symbol/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /more filters/i })).toBeTruthy()
    // Side segment: Overview's three options.
    expect(screen.getByRole('button', { name: /^long$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^short$/i })).toBeTruthy()

    // ABSENT: every quick-range key. These are the range strip, and Compare's
    // period pickers own dates.
    for (const key of ['7D', '30D', '90D', 'YTD']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(`^${key}$`, 'i') }),
        `${key} range chip must NOT render on Compare`,
      ).toBeNull()
    }

    // AND NO DATE INPUT INSIDE THE BAR. Scoped deliberately: CompareView's own
    // period pickers carry four date inputs (A from/to, B from/to) and those
    // MUST survive — they are the thing the bar is not allowed to compete
    // with. So the assertion is "none in the bar", never "none on the page".
    const slot = container.querySelector('[data-compare-filter-slot]') as HTMLElement
    expect(slot, 'the filter slot is rendered').toBeTruthy()
    expect(
      within(slot).queryAllByPlaceholderText(/symbol/i).length,
      'the bar itself is inside the slot',
    ).toBe(1)
    expect(slot.querySelectorAll('input[type="date"]')).toHaveLength(0)
    // the period pickers kept theirs
    expect(container.querySelectorAll('input[type="date"]').length).toBe(4)
  })

  it('the period pickers are UNCHANGED — the collision the design avoids', () => {
    draw()
    // The period preset chips belong to CompareView, not the bar, and must
    // still be there. This is the control: if the bar had brought a range,
    // these would now be competing with it.
    expect(screen.getAllByText(/period a/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/period b/i).length).toBeGreaterThan(0)
  })

  it('the symbol control narrows the rows BOTH periods compute from', async () => {
    const user = userEvent.setup()
    const { container } = draw()
    expect(totalTrades(container)).toBe('4vs3')
    await user.type(screen.getByPlaceholderText(/symbol/i), 'AAAA')
    // Only MAY holds AAAA, so period B empties.
    await waitFor(() => expect(totalTrades(container)).toBe('4vs—'))
  })

  it('the side control narrows the rows BOTH periods compute from', async () => {
    const user = userEvent.setup()
    const { container } = draw()
    expect(totalTrades(container)).toBe('4vs3')
    await user.click(screen.getByRole('button', { name: /^short$/i }))
    // Only JUNE holds shorts, so period A empties.
    await waitFor(() => expect(totalTrades(container)).toBe('—vs3'))
  })

  // DAVE'S TICKET, RE-PINNED. The mistake control still narrows both periods,
  // exactly as the standalone dropdown did.
  it('the mistake control still works exactly as before', async () => {
    const user = userEvent.setup()
    const { container } = draw()
    await user.click(screen.getByRole('button', { name: /more filters/i }))
    const menu = await screen.findByRole('button', { name: /mistake/i })
    await user.click(menu)
    await user.click(await screen.findByText('Chased'))
    // Only JUNE carries Chased, so period A empties.
    await waitFor(() => expect(totalTrades(container)).toBe('—vs3'))
  })

  // THE NEW GUARD, AND THE REASON BOTH CHANGES SHARE A BEAT. Before this beat
  // only a date range could empty a period. Now a filter can, and the rule
  // that landed at 4f7c5cb must fire on that trigger too.
  it('a filter that empties ONE period triggers the empty-side rule', async () => {
    const user = userEvent.setup()
    const { container } = draw()
    await user.click(screen.getByRole('button', { name: /^short$/i }))
    await waitFor(() => expect(totalTrades(container)).toBe('—vs3'))

    // A dash on the empty side, and NO delta anywhere in the Activity card.
    expect(deltaOf(container, 'Total trades')).toBe('—')
    expect(deltaOf(container, 'Winners')).toBe('—')
    expect(deltaOf(container, 'Fees')).toBe('—')

    // No colour, no arrow: a delta against an absence is not a measurement.
    const card = Array.from(container.querySelectorAll('div.rounded-lg.border')).find((c) =>
      (c.querySelector('h3')?.textContent ?? '').includes('Activity'),
    ) as HTMLElement
    expect(card.querySelectorAll('.text-win')).toHaveLength(0)
    expect(card.querySelectorAll('.text-loss')).toHaveLength(0)

    // And the line that NAMES which period is empty.
    expect(screen.getByText(/Period A has no trades in this range/i)).toBeTruthy()
  })

  it('the growth gate fires for ANY active filter, not just mistakes', async () => {
    const user = userEvent.setup()
    draw()
    // Unfiltered: the growth row is present.
    expect(screen.queryByText(/Net P&L \(% of contributed\)/i)).toBeTruthy()
    // A NON-mistake filter must hide it. Before this beat only mistakes did.
    await user.type(screen.getByPlaceholderText(/symbol/i), 'AAAA')
    await waitFor(() =>
      expect(screen.queryByText(/Net P&L \(% of contributed\)/i)).toBeNull(),
    )
  })

  it('the hint line generalises from mistakes to the whole filter state', async () => {
    const user = userEvent.setup()
    draw()
    expect(screen.queryByText(/both periods narrowed/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /^long$/i }))
    await waitFor(() => expect(screen.getByText(/both periods narrowed/i)).toBeTruthy())
  })
})

describe('AnalyticsCompareTab — the Activity card spans both grid columns', () => {
  it('the split card spans, and no other card does', () => {
    const { container } = draw()
    const cards = Array.from(
      container.querySelectorAll('div.rounded-lg.border'),
    ).filter((c) => c.querySelector('h3') && c.querySelectorAll('div.grid.min-h-8').length > 0)

    const spanning = cards.filter((c) => c.className.includes('lg:col-span-2'))
    expect(spanning, 'exactly one card spans both columns').toHaveLength(1)
    expect(spanning[0].querySelector('h3')?.textContent ?? '').toContain('Activity')
    // and it is the split one
    expect(spanning[0].querySelector('[data-stat-split]')).toBeTruthy()
  })

  it('the other six cards are unchanged — placement asserted on all seven', () => {
    const { container } = draw()
    const grid = container.querySelector('.grid.grid-cols-1.gap-4') as HTMLElement
    expect(grid, 'the seven-card grid is rendered').toBeTruthy()
    const cards = Array.from(grid.children) as HTMLElement[]
    expect(cards).toHaveLength(7)
    const titles = cards.map((c) => c.querySelector('h3')?.textContent ?? '')
    expect(titles).toEqual([
      'Edge Core', 'P&L per share', 'P&L %', 'Consistency',
      'Execution Quality', 'Behavior', 'Activity & Streaks',
    ])
    // Only the seventh spans; the first six carry no span class at all.
    cards.slice(0, 6).forEach((c, i) => {
      expect(c.className.includes('col-span'), `card ${i + 1} (${titles[i]}) must not span`).toBe(false)
    })
    expect(cards[6].className.includes('lg:col-span-2')).toBe(true)
  })

  // THE VALUE-IDENTITY CONTROL, same method beat 222 used. The span is a
  // layout change: if it moved a number, this fails.
  it('every value in the nineteen-row Activity card is unchanged by the span', () => {
    const { container } = draw()
    const card = Array.from(container.querySelectorAll('div.rounded-lg.border')).find((c) =>
      (c.querySelector('h3')?.textContent ?? '').includes('Activity'),
    ) as HTMLElement
    const rows = Array.from(card.querySelectorAll('div.grid.min-h-8'))
    expect(rows).toHaveLength(19)

    const triples = rows.map((r) => [
      (r.children[0]?.textContent ?? '').trim().replace(/\s+/g, ' '),
      (r.children[1]?.textContent ?? '').replace(/\s+/g, ''),
      (r.children[2]?.textContent ?? '').replace(/\s+/g, ''),
    ])
    // The known answers for this fixture: 4 May trades against 3 June trades,
    // all four May trades winners, all three June trades losers.
    const byLabel = new Map(triples.map((t) => [t[0], t]))
    expect(byLabel.get('Total trades')?.[1]).toBe('4vs3')
    expect(byLabel.get('Total trades')?.[2]).toBe('+1')
    expect(byLabel.get('Winners')?.[1]).toBe('4vs0')
    expect(byLabel.get('Losers')?.[1]).toBe('0vs3')
    expect(byLabel.get('Trading days')?.[1]).toBe('4vs3')
    // Not one cell may be blank, and every delta must be present.
    triples.forEach(([label, values, delta]) => {
      expect(label, 'row label is rendered').not.toBe('')
      expect(values, `${label} renders its A-vs-B values`).toMatch(/vs/)
      expect(delta, `${label} renders a delta`).not.toBe('')
    })
  })
})

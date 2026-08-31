// @vitest-environment jsdom
//
// v0.2.7 -- THE SETUP LIBRARY OPENS THE TRADE MODAL.
//
// FOUNDER RULINGS these guards enforce:
//   The arrows walk the setup's FULL SET, never the rendered slice. The card
//     caps at eight rows while holding every row in memory, so a nav built
//     from what is on screen would say "one of eight" on a nine trade setup
//     and refuse to walk past the cap.
//   FREEZE ON OPEN. The list the arrows walk, and the row the modal shows,
//     are both taken at click time. An edit that would move the trade out of
//     this setup does not change either while the modal is open, and it does
//     not unmount the modal. The Trades tab does the opposite: it resolves
//     the open row from the live filtered list, so the same edit nulls the
//     modal's trade prop and TradeDetailModal line one six seven unmounts it
//     with no message. That defect is not touched here.
//   The ends disable, matching the Trades tab exactly, because the position
//     helper returns null there and the modal is already gated on it.
//   Trash closes the modal, which is what the Trades tab already does.

import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import PlaybookTradesCard from '../PlaybookTradesCard'

// The modal's Overview tab mounts PlaybookPicker, which calls ipc on mount,
// and the card itself now calls ipc to persist. Stub the whole surface: any
// method resolves, which is enough for mount-time effects and for a save to
// return "nothing changed" unless a test overrides it.
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

afterEach(() => cleanup())

/** N trades under one setup, newest first, each on its own day. */
function trades(n: number): TradeListRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      id: i + 1,
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      symbol: `SYM${i + 1}`,
      net_pnl: i % 2 === 0 ? 120 + i : -80 - i,
      playbook_id: 7,
      playbook_name: 'Micro Pullback',
      playbook_tier: 'A',
    }),
  )
}

const mount = (rows: TradeListRow[], onRefresh?: () => void) =>
  render(
    <PlaybookTradesCard
      trades={rows}
      setupName="Micro Pullback"
      onRefresh={onRefresh}
    />,
  )

const rowFor = (c: HTMLElement, id: number) =>
  c.querySelector(`[data-playbook-trade-row="${id}"]`) as HTMLElement
const modalTitle = () => document.getElementById('trade-detail-title')

/** The modal's own "N of M", scoped to the dialog. The card's header carries
 *  "showing 8 of 9" in the same shape, so an unscoped text query matches both
 *  -- and the modal renders the two numbers in separate text nodes, so the
 *  match has to be on the element's normalised textContent. */
const counter = () => {
  const dialog = screen.queryByRole('dialog')
  if (!dialog) return null
  const spans = Array.from(dialog.querySelectorAll('span'))
  const hit = spans.find((s) => /^\d+ of \d+$/.test((s.textContent ?? '').replace(/\s+/g, ' ').trim()))
  return hit ? (hit.textContent ?? '').replace(/\s+/g, ' ').trim() : null
}

// --- PM1 --------------------------------------------------------------------

describe('PM1 a row click opens the modal on that trade', () => {
  it('no modal before the click', () => {
    mount(trades(9))
    expect(modalTitle()).toBeNull()
  })

  it('clicking the third row opens the modal showing that trade', () => {
    const { container } = mount(trades(9))
    fireEvent.click(rowFor(container, 3))
    expect(modalTitle()?.textContent, 'the modal did not open on the clicked trade')
      .toBe('SYM3')
  })
})

// --- PM2 --------------------------------------------------------------------

describe('PM2 the position reads the FULL set, not the rendered slice', () => {
  it('nine trades, eight rendered, and the counter says nine', () => {
    const { container } = mount(trades(9))
    expect(container.querySelectorAll('tbody tr').length,
      'the fixture must exercise the cap').toBe(8)
    fireEvent.click(rowFor(container, 1))
    expect(counter()).toBe('1 of 9')
  })

  it('and the ninth trade is reachable even though its row is not rendered', () => {
    const { container } = mount(trades(9))
    fireEvent.click(rowFor(container, 8))
    expect(counter()).toBe('8 of 9')
    fireEvent.click(screen.getByLabelText('Next trade'))
    expect(modalTitle()?.textContent, 'the walk stopped at the visible cap')
      .toBe('SYM9')
    expect(counter()).toBe('9 of 9')
  })
})

// --- PM3 --------------------------------------------------------------------

describe('PM3 the arrows move to the neighbour in the setup order', () => {
  it('next goes to the row below, prev comes back', () => {
    const { container } = mount(trades(9))
    fireEvent.click(rowFor(container, 4))
    expect(modalTitle()?.textContent).toBe('SYM4')
    fireEvent.click(screen.getByLabelText('Next trade'))
    expect(modalTitle()?.textContent).toBe('SYM5')
    fireEvent.click(screen.getByLabelText('Previous trade'))
    expect(modalTitle()?.textContent).toBe('SYM4')
  })
})

// --- PM4 --------------------------------------------------------------------

describe('PM4 the ends disable, with no wrap', () => {
  it('the first trade disables prev and leaves next live', () => {
    const { container } = mount(trades(9))
    fireEvent.click(rowFor(container, 1))
    expect((screen.getByLabelText('Previous trade') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Next trade') as HTMLButtonElement).disabled).toBe(false)
  })

  it('the last trade disables next and leaves prev live', () => {
    const { container } = mount(trades(9))
    fireEvent.click(rowFor(container, 8))
    fireEvent.click(screen.getByLabelText('Next trade'))
    expect(counter(), 'this test must land on the last trade').toBe('9 of 9')
    expect((screen.getByLabelText('Next trade') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Previous trade') as HTMLButtonElement).disabled).toBe(false)
  })
})

// --- PM5 -- THE RULING ------------------------------------------------------

describe('PM5 FREEZE ON OPEN: the list does not move under the modal', () => {
  it('the modal stays mounted on the same trade when the page drops that row', () => {
    const rows = trades(9)
    const { container, rerender } = mount(rows)
    fireEvent.click(rowFor(container, 4))
    expect(modalTitle()?.textContent).toBe('SYM4')

    // The page re-reads and this trade no longer belongs to the setup --
    // exactly what an in-modal playbook change would produce.
    rerender(
      <PlaybookTradesCard
        trades={rows.filter((t) => t.id !== 4)}
        setupName="Micro Pullback"
      />,
    )

    expect(modalTitle(), 'the modal unmounted when the row left the list').not.toBeNull()
    expect(modalTitle()?.textContent).toBe('SYM4')
  })

  it('and the arrows still walk the ORIGINAL list, so the count is unchanged', () => {
    const rows = trades(9)
    const { container, rerender } = mount(rows)
    fireEvent.click(rowFor(container, 4))
    expect(counter()).toBe('4 of 9')

    rerender(
      <PlaybookTradesCard
        trades={rows.filter((t) => t.id !== 4)}
        setupName="Micro Pullback"
      />,
    )

    expect(counter(), 'the frozen list moved under the arrows').toBe('4 of 9')
    fireEvent.click(screen.getByLabelText('Next trade'))
    expect(modalTitle()?.textContent).toBe('SYM5')
  })

  it('closing refreshes the page behind exactly once', () => {
    const onRefresh = vi.fn()
    const { container } = mount(trades(9), onRefresh)
    fireEvent.click(rowFor(container, 2))
    expect(onRefresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(modalTitle()).toBeNull()
  })
})

// --- PM6 --------------------------------------------------------------------

describe('PM6 the table itself is unchanged', () => {
  it('still caps at eight rows and still names the true total', () => {
    const { container } = mount(trades(9))
    expect(container.querySelectorAll('tbody tr').length).toBe(8)
    expect(screen.getByText('showing 8 of 9')).toBeTruthy()
  })

  it('an empty setup still renders its one quiet line and no modal', () => {
    const { container } = mount([])
    expect(container.querySelectorAll('[data-playbook-trades-empty]').length).toBe(1)
    expect(modalTitle()).toBeNull()
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMacdBuckets } from '@/core/technicals/macdBuckets'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import MacdStateGrid from '../MacdStateGrid'

// Characterization tests (F3 phase 1/3) — lock the CURRENT externally observable
// behavior of MacdStateGrid's open/close state machine before the BucketBand
// extraction. Assertions hit only public signals: aria-expanded on the cards,
// aria-hidden="false" on the open AccordionPanel's inner div, and raw <table>
// DOM presence. NEVER openBucket / displayBucket / closeTimer.
//
// Interaction uses fireEvent.click, NOT userEvent: under vi.useFakeTimers the
// userEvent click pipeline deadlocks (its async event sequence awaits timers the
// fake clock never auto-advances). fireEvent dispatches synchronously, so the
// 210ms close timer is the ONLY thing on the fake clock — exactly what the
// 209→210 boundary assertions need. The setTimeout-driven displayBucket lag is
// advanced explicitly via act(async () => advanceTimersByTimeAsync).
//
// Table mount status is read via container.querySelectorAll('table'), NOT
// queryByRole('table'): during a close/switch the table stays mounted inside a
// now-aria-hidden panel, and role queries (which honor aria-hidden) would report
// it gone before it actually unmounts. The raw DOM query sees the truth.

// One classifiable row per bucket, each with a distinct macd_line so a mounted
// table is identifiable by its (table-only) MACD value: '+1.111' = posRising,
// '+4.444' = negFalling. macd_positive / macd_rising drive classifyMacdBucket.
const ROWS = [
  makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true, macd_rising: true, macd_line: 1.111 }) }),
  makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_positive: true, macd_rising: false, macd_line: 2.222 }) }),
  makeRow({ id: 3, technicals: makeCompleteSnapshot({ macd_positive: false, macd_rising: true, macd_line: 3.333 }) }),
  makeRow({ id: 4, technicals: makeCompleteSnapshot({ macd_positive: false, macd_rising: false, macd_line: 4.444 }) }),
]
const STATS = computeMacdBuckets(ROWS, '1m')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderGrid() {
  return render(
    <MacdStateGrid stats={STATS} filteredRows={ROWS} timeframe="1m" />,
  )
}

// The four bucket cards, re-queried fresh (the buttons re-render on every click).
// The whole card is a <button>, so its accessible name is the title + stats; a
// substring regex on the title uniquely selects each.
function cards() {
  return {
    posRising: screen.getByRole('button', { name: /Positive \+ Rising/ }),
    posFalling: screen.getByRole('button', { name: /Positive \+ Falling/ }),
    negRising: screen.getByRole('button', { name: /Negative \+ Rising/ }),
    negFalling: screen.getByRole('button', { name: /Negative \+ Falling/ }),
  }
}

// Fire pending fake timers and flush the resulting React state updates.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('MacdStateGrid — open/close state machine (characterization)', () => {
  it('initial state: no panel open, no table mounted, all cards collapsed', () => {
    const { container } = renderGrid()
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(0)
    expect(container.querySelectorAll('table')).toHaveLength(0)
    const c = cards()
    expect(c.posRising.getAttribute('aria-expanded')).toBe('false')
    expect(c.posFalling.getAttribute('aria-expanded')).toBe('false')
    expect(c.negRising.getAttribute('aria-expanded')).toBe('false')
    expect(c.negFalling.getAttribute('aria-expanded')).toBe('false')
  })

  it('open from clean: clicking a card opens its row panel and mounts its table', () => {
    const { container } = renderGrid()
    fireEvent.click(cards().posRising)

    const c = cards()
    expect(c.posRising.getAttribute('aria-expanded')).toBe('true')
    expect(c.posFalling.getAttribute('aria-expanded')).toBe('false')
    expect(c.negRising.getAttribute('aria-expanded')).toBe('false')
    expect(c.negFalling.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(1)
    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(screen.getByText('+1.111')).toBeTruthy() // posRising's table content
  })

  it('close by re-click: panel collapses at once, table unmounts at exactly 210ms', async () => {
    const { container } = renderGrid()
    fireEvent.click(cards().posRising) // open
    fireEvent.click(cards().posRising) // re-click → start close

    // Immediately: card collapsed, no open panel, but the table is still mounted.
    expect(cards().posRising.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(0)
    expect(container.querySelectorAll('table')).toHaveLength(1)

    // Still mounted at 209ms…
    await advance(209)
    expect(container.querySelectorAll('table')).toHaveLength(1)

    // …gone at exactly 210ms.
    await advance(1)
    expect(container.querySelectorAll('table')).toHaveLength(0)
  })

  it('sequential switch: A collapses, neither panel open during 210ms transit, B opens at 210ms', async () => {
    const { container } = renderGrid()
    fireEvent.click(cards().posRising) // open A
    expect(screen.getByText('+1.111')).toBeTruthy()

    fireEvent.click(cards().negFalling) // switch to B (different row)

    // Immediately: A collapsed, B not yet open, NEITHER panel open, A's table persists.
    expect(cards().posRising.getAttribute('aria-expanded')).toBe('false')
    expect(cards().negFalling.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(0)
    expect(screen.queryByText('+1.111')).not.toBeNull()

    // Still in transit at 209ms (both closed, A's table still mounted).
    await advance(209)
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(0)
    expect(screen.queryByText('+1.111')).not.toBeNull()

    // At 210ms: B opens, B's table mounts, A's table is gone.
    await advance(1)
    expect(cards().negFalling.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(1)
    expect(screen.getByText('+4.444')).toBeTruthy()
    expect(screen.queryByText('+1.111')).toBeNull()
  })

  it('mid-transit re-click same bucket: the pending unmount is cancelled, no race', async () => {
    const { container } = renderGrid()
    fireEvent.click(cards().posRising) // open
    fireEvent.click(cards().posRising) // start close (210ms pending)
    await advance(50) // 50ms into the close

    fireEvent.click(cards().posRising) // re-click before 210ms → cancel + reopen

    expect(cards().posRising.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(1)
    expect(container.querySelectorAll('table')).toHaveLength(1)

    // Well past the original timer's deadline — no stray unmount fires.
    await advance(1000)
    expect(cards().posRising.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('[aria-hidden="false"]')).toHaveLength(1)
    expect(container.querySelectorAll('table')).toHaveLength(1)
  })
})

// @vitest-environment jsdom
//
// Dave #18 — SENTIMENT RUBRIC ON HOVER. The calendar SentimentBadge's bare
// native title ("Click to set market sentiment (1–5)") becomes the house
// Tooltip: an action line honest to the click-to-CYCLE affordance plus the
// five-row rubric rendered FROM the imported SENTIMENT_LABELS — never
// duplicated strings (pinned by mutating the constant in-test). The native
// title goes; the badge keeps an EMPTY title="" purely to suppress the
// DayCell button's own gross/fees/net title from doubling over the popover.
// aria-label unchanged. The pickers already teach per-level — untouched.

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CalendarDay, WeeklySummary } from '@shared/calendar-types'
import { SENTIMENT_LABELS } from '@shared/session-types'
import CalendarGrid from '@/components/calendar/CalendarGrid'

const noop = () => {}

function day(date: string, over: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date,
    net_pnl: 23.8,
    gross_pnl: 25,
    total_fees: 1.2,
    trade_count: 1,
    winners: 1,
    losers: 0,
    avg_winner: 23.8,
    avg_loser: null,
    day_tags: [],
    has_journal: false,
    no_trade_day: false,
    is_holiday: false,
    sentiment: null,
    ...over,
  }
}

const DAYS: CalendarDay[] = [
  day('2026-05-06', { sentiment: 3 }),
  day('2026-05-07'),
]

const cycleSpy = vi.fn()

function renderGrid() {
  render(
    <CalendarGrid
      year={2026}
      month={5}
      days={DAYS}
      weeks={[] as WeeklySummary[]}
      selectedDate={null}
      todayDate="2026-05-20"
      showWeekly={false}
      onSelectDate={noop}
      onSelectWeek={noop}
      onCycleSentiment={cycleSpy}
    />,
  )
}

const SET_LABEL = 'Sentiment 3/5 — click to cycle'
const UNSET_LABEL = 'Click to set market sentiment (1–5)'

/** The badge's own tooltip content (each badge wraps in its own Tooltip). */
function tooltipOf(badge: HTMLElement): HTMLElement {
  const tip = badge.closest('.group')?.querySelector('[role="tooltip"]')
  if (!tip) throw new Error('no tooltip attached to the badge')
  return tip as HTMLElement
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CalendarGrid SentimentBadge — the rubric on hover (Dave #18)', () => {
  it('(1) all five canon rows render FROM the constant — mutate it and the tooltip follows', () => {
    const original = SENTIMENT_LABELS[3]
    try {
      ;(SENTIMENT_LABELS as Record<number, string>)[3] = 'MUTATED CANON ROW'
      renderGrid()
      const tip = tooltipOf(screen.getByLabelText(SET_LABEL))
      const text = tip.textContent ?? ''
      expect(text).toContain('MUTATED CANON ROW') // no duplicated strings
      for (const n of [1, 2, 4, 5] as const) {
        expect(text).toContain(`${n}/5`)
        expect(text).toContain(SENTIMENT_LABELS[n])
      }
      expect(text).toContain('3/5')
    } finally {
      ;(SENTIMENT_LABELS as Record<number, string>)[3] = original
    }
  })

  it('(2) the action line is honest to the affordance — "click to cycle", never "select"', () => {
    renderGrid()
    const tip = tooltipOf(screen.getByLabelText(SET_LABEL))
    expect(tip.textContent).toContain(SET_LABEL)
    expect(tip.textContent).not.toMatch(/select/i)
  })

  it('(3) click still CYCLES — the write path untouched', () => {
    renderGrid()
    fireEvent.click(screen.getByLabelText(SET_LABEL))
    expect(cycleSpy).toHaveBeenCalledWith('2026-05-06', 3)
  })

  it('(4) aria-label preserved; the native title is gone (empty suppressor only — no double-tooltip)', () => {
    renderGrid()
    const badge = screen.getByLabelText(SET_LABEL)
    // The OLD behavior put the full text in title; now it must not.
    expect(badge.getAttribute('title')).not.toBe(SET_LABEL)
    expect(badge.getAttribute('title') ?? '').toBe('')
    // Unset badges too (every unset in-month cell shares the label).
    const unset = screen.getAllByLabelText(UNSET_LABEL)[0]
    expect(unset.getAttribute('title')).not.toBe(UNSET_LABEL)
    expect(unset.getAttribute('title') ?? '').toBe('')
  })

  it('(5) the unset state carries the set line plus the same rubric', () => {
    renderGrid()
    const tip = tooltipOf(screen.getAllByLabelText(UNSET_LABEL)[0])
    const text = tip.textContent ?? ''
    expect(text).toContain(UNSET_LABEL)
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(text).toContain(SENTIMENT_LABELS[n])
    }
  })
})

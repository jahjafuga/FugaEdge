import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NoTradeDayModal from '@/components/calendar/NoTradeDayModal'
import { ipc } from '@/lib/ipc'
import type { JournalDay, JournalEntry } from '@shared/journal-types'

// Renderer-style test (no jest-dom — toBeTruthy/toBeNull, per the Settings tests).
// Covers the NEW "Remove no-trade-day" action: it must fully un-mark a day across
// BOTH stores (journal.day_tags chip + session_meta.no_trade_day) AND clear the
// "Sat out:" reason note — while preserving every OTHER day_tag and any unrelated
// journal text. The add/edit-reason "Mark sit-out" path must stay unchanged.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    journalGet: vi.fn(),
    calendarGet: vi.fn(),
    dayTagsSave: vi.fn(),
    sessionNoTradeSave: vi.fn(),
    journalSave: vi.fn(),
  },
}))

const m = vi.mocked(ipc)
const DATE = '2026-05-14'

function journalDay(entry: Partial<JournalEntry> | null): JournalDay {
  return {
    date: DATE,
    entry:
      entry === null
        ? null
        : {
            premarket_notes: '',
            postsession_notes: '',
            emotion_rating: null,
            rules_followed: [],
            rule_violations: [],
            ...entry,
          },
    summary: null,
    rules: [],
    sentiment: null,
  }
}

// Minimal CalendarMonth carrying one day. Only date / no_trade_day / day_tags are
// read by the modal; the rest is padded to satisfy the shape (cast at the mock).
function calMonth(day: { no_trade_day?: boolean; day_tags?: string[] }) {
  return {
    stats: {
      year: 2026, month: 5, net_pnl: 0, gross_pnl: 0, total_fees: 0,
      trade_count: 0, winners: 0, losers: 0, trading_days: 0,
    },
    days: [
      { date: DATE, no_trade_day: day.no_trade_day ?? false, day_tags: day.day_tags ?? [] },
    ],
    range: { earliest: null, latest: null, monthsWithTrades: [] },
    weeks: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.dayTagsSave.mockResolvedValue({ date: DATE, tags: [] } as never)
  m.sessionNoTradeSave.mockResolvedValue({
    date: DATE, sentiment: null, notes: '', no_trade_day: false, no_trade_reason: '',
  } as never)
  m.journalSave.mockResolvedValue({} as never)
})

describe('NoTradeDayModal — Remove no-trade-day', () => {
  it('PRESERVE: strips only the chip, keeps other day_tags, never writes []', async () => {
    m.journalGet.mockResolvedValue(
      journalDay({ postsession_notes: 'Sat out: overslept', premarket_notes: 'had a plan' }) as never,
    )
    m.calendarGet.mockResolvedValue(
      calMonth({ no_trade_day: true, day_tags: ['FOMC', 'no-trade-day', 'Choppy'] }) as never,
    )

    render(<NoTradeDayModal date={DATE} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(await screen.findByText('Remove no-trade-day'))

    await waitFor(() => expect(m.dayTagsSave).toHaveBeenCalledTimes(1))
    // Order-preserving filter: 'no-trade-day' gone, FOMC + Choppy intact.
    expect(m.dayTagsSave).toHaveBeenCalledWith({ date: DATE, tags: ['FOMC', 'Choppy'] })
    // The data-loss guard: never a blind wipe.
    expect(m.dayTagsSave.mock.calls[0][0].tags).not.toEqual([])
  })

  it('BOTH-STORES + NOTE: clears session_meta, day_tags, and the Sat out note; preserves premarket', async () => {
    m.journalGet.mockResolvedValue(
      journalDay({
        postsession_notes: 'Sat out: overslept',
        premarket_notes: 'had a plan',
        emotion_rating: 3,
      }) as never,
    )
    m.calendarGet.mockResolvedValue(
      calMonth({ no_trade_day: true, day_tags: ['no-trade-day'] }) as never,
    )

    render(<NoTradeDayModal date={DATE} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(await screen.findByText('Remove no-trade-day'))

    // session_meta cleared (flag false, reason blank).
    await waitFor(() => expect(m.sessionNoTradeSave).toHaveBeenCalledTimes(1))
    expect(m.sessionNoTradeSave).toHaveBeenCalledWith({
      date: DATE, no_trade_day: false, no_trade_reason: '',
    })
    // day_tags filtered — the chip was the only tag, so [] is the CORRECT result here.
    expect(m.dayTagsSave).toHaveBeenCalledWith({ date: DATE, tags: [] })
    // "Sat out:" note blanked; premarket + emotion preserved.
    expect(m.journalSave).toHaveBeenCalledTimes(1)
    const j = m.journalSave.mock.calls[0][0]
    expect(j.postsession_notes).toBe('')
    expect(j.premarket_notes).toBe('had a plan')
    expect(j.emotion_rating).toBe(3)
  })

  it('SESSION-META-ONLY: Remove shows with no chip/note; clears session_meta, leaves day_tags + a real note untouched', async () => {
    // Flagged via session_meta only (no chip), with a genuine post-session note.
    m.journalGet.mockResolvedValue(
      journalDay({ postsession_notes: 'Solid discipline today' }) as never,
    )
    m.calendarGet.mockResolvedValue(
      calMonth({ no_trade_day: true, day_tags: [] }) as never,
    )

    render(<NoTradeDayModal date={DATE} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(await screen.findByText('Remove no-trade-day'))

    await waitFor(() => expect(m.sessionNoTradeSave).toHaveBeenCalledTimes(1))
    expect(m.sessionNoTradeSave).toHaveBeenCalledWith({
      date: DATE, no_trade_day: false, no_trade_reason: '',
    })
    // No chip -> no day_tags write; real note (not "Sat out:") -> journal untouched.
    expect(m.dayTagsSave).not.toHaveBeenCalled()
    expect(m.journalSave).not.toHaveBeenCalled()
  })

  it('HIDDEN: no Remove button on a day that is not a no-trade-day', async () => {
    m.journalGet.mockResolvedValue(journalDay(null) as never)
    m.calendarGet.mockResolvedValue(calMonth({ no_trade_day: false, day_tags: [] }) as never)

    render(<NoTradeDayModal date={DATE} onClose={vi.fn()} onSaved={vi.fn()} />)

    // "Mark sit-out" is always present once loaded — use it as the load gate.
    expect(await screen.findByText('Mark sit-out')).toBeTruthy()
    expect(screen.queryByText('Remove no-trade-day')).toBeNull()
  })

  it('REGRESSION: Mark sit-out still writes the Sat out note and adds the chip preserving prior tags', async () => {
    m.journalGet.mockResolvedValue(journalDay(null) as never)
    m.calendarGet.mockResolvedValue(calMonth({ no_trade_day: false, day_tags: ['FOMC'] }) as never)

    render(<NoTradeDayModal date={DATE} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(await screen.findByText('No setups'))
    fireEvent.click(screen.getByText('Mark sit-out'))

    await waitFor(() => expect(m.journalSave).toHaveBeenCalledTimes(1))
    expect(m.journalSave.mock.calls[0][0].postsession_notes).toBe('Sat out: No setups')
    await waitFor(() => expect(m.dayTagsSave).toHaveBeenCalledTimes(1))
    expect(m.dayTagsSave).toHaveBeenCalledWith({ date: DATE, tags: ['FOMC', 'no-trade-day'] })
  })
})

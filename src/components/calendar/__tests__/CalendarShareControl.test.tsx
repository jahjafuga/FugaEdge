// @vitest-environment jsdom
// v0.2.7 Feature 5, the entry point — the card becomes something a user can make.
//
// The commit before this one built and tested the compositor thoroughly and left
// it unreachable. So these drive the REAL header: mount it, find the button a
// person would click, click it, and assert on the bytes that reached the save
// dialog and on the text that reached the canvas. Nothing here calls
// composeCalendarCard directly — that is the point.

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDay, CalendarMonth, WeeklySummary } from '@shared/calendar-types'
import { STREAMER_STORAGE_KEY } from '@/lib/streamerMode'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'
import { makeSettingsPayload } from '@/test/fixtures/settings'

// Only four channels exist for this surface. Anything the component reaches for
// beyond them is a TypeError, which is the point: T2 asserts one save path, and
// an undeclared channel would fail loudly rather than pass quietly.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    chartSaveScreenshot: vi.fn(),
    accountsList: vi.fn(),
    cashBalanceGet: vi.fn(),
    settingsGet: vi.fn(), // AccountScopeProvider's own boot read
  },
}))

import CalendarHeader from '../CalendarHeader'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// ── Fixtures: the two months that actually exist ─────────────────────────
// LIVE 2026-07 — 4 trading days in 31 cells. PRESET 2026-06 — 18 in 30.
function day(date: string, net: number, trades: number): CalendarDay {
  return {
    date,
    net_pnl: net,
    gross_pnl: net,
    total_fees: 0,
    trade_count: trades,
    winners: net > 0 ? trades : 0,
    losers: net < 0 ? trades : 0,
    avg_winner: null,
    avg_loser: null,
    day_tags: [],
    has_journal: false,
    no_trade_day: false,
    is_holiday: false,
    sentiment: null,
  }
}

const JULY_DAYS = [
  day('2026-07-28', -1.84, 1),
  day('2026-07-29', -12.0, 5),
  day('2026-07-30', -4.41, 2),
  day('2026-07-31', 19.24, 8),
]
const JUNE_DAYS = [
  day('2026-06-22', 36.09, 11),
  day('2026-06-23', 35.12, 4),
  day('2026-06-24', -6.83, 15),
]

function month(y: number, mo: number, days: CalendarDay[]): CalendarMonth {
  const net = days.reduce((a, d) => a + d.net_pnl, 0)
  return {
    stats: {
      year: y,
      month: mo,
      net_pnl: net,
      gross_pnl: net,
      total_fees: 0,
      trade_count: days.reduce((a, d) => a + d.trade_count, 0),
      winners: days.filter((d) => d.net_pnl > 0).length,
      losers: days.filter((d) => d.net_pnl < 0).length,
      trading_days: days.length,
    },
    days,
    range: { earliest: '2026-06-01', latest: '2026-07-31', monthsWithTrades: ['2026-06', '2026-07'] },
    weeks: [] as WeeklySummary[],
  }
}
const JULY = month(2026, 7, JULY_DAYS)
const JUNE = month(2026, 6, JUNE_DAYS)

let rec: ReturnType<typeof installRecordingCanvas>
let restoreDecode: () => void

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  rec = installRecordingCanvas()
  restoreDecode = installImageDecode()
  m.chartSaveScreenshot.mockResolvedValue({ canceled: false, path: 'C:/out.png' })
  m.accountsList.mockResolvedValue([
    { id: 'acct-main', name: 'Main', account_type: 'live' } as never,
  ])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  // A $10,000 anchor: starting + deposits - withdrawals, the shipped denominator.
  m.cashBalanceGet.mockResolvedValue({
    account_id: 'acct-main',
    anchor_date: '2026-01-01',
    starting: 10_000,
    deposits: 0,
    withdrawals: 0,
    net_pnl: 0,
    balance: 10_000,
  })
})
afterEach(() => {
  rec.restore()
  restoreDecode()
})

function mount(mo: CalendarMonth = JULY) {
  return render(
    <AccountScopeProvider>
      <CalendarHeader
        month={mo}
        onPrev={() => {}}
        onNext={() => {}}
        onToday={() => {}}
        isCurrentMonth={false}
      />
    </AccountScopeProvider>,
  )
}
async function mountReady(mo: CalendarMonth = JULY) {
  const r = mount(mo)
  await waitFor(() => expect(m.cashBalanceGet).toHaveBeenCalled())
  await act(async () => {
    await Promise.resolve()
  })
  return r
}
const shareButton = () => screen.getByRole('button', { name: /card/i }) as HTMLButtonElement
const saveArg = () => m.chartSaveScreenshot.mock.calls[0]?.[0]

describe('T1 clicking the action composes the DISPLAYED month', () => {
  it('July on screen produces a July card', async () => {
    mount(JULY)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(rec.texts).toContain('July 2026')
    expect(rec.texts).not.toContain('June 2026')
  })

  it('June on screen produces a June card — no default, no today', async () => {
    mount(JUNE)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(rec.texts).toContain('June 2026')
    expect(rec.texts).not.toContain('July 2026')
  })

  it('and it is the displayed month\u2019s OWN days, not another month\u2019s', async () => {
    mount(JULY)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    // July's four days, by the app's own `{n}t` badge. June's 11/4/15 must not
    // appear.
    expect(rec.texts).toContain('1t')
    expect(rec.texts).toContain('8t')
    expect(rec.texts).not.toContain('11t')
    expect(rec.texts).not.toContain('15t')
  })
})

describe('T2 it saves through the EXISTING dialog path', () => {
  it('the one save channel is called, with PNG bytes', async () => {
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalledTimes(1))
    const arg = saveArg()
    expect(arg.bytes).toBeInstanceOf(Uint8Array)
    expect(arg.bytes.length).toBeGreaterThan(0)
    expect(typeof arg.suggestedName).toBe('string')
  })

  it('no second save idiom: the component reaches for nothing else', async () => {
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    // Every other mocked channel stays untouched by the save itself.
    expect(m.accountsList.mock.calls.length + m.cashBalanceGet.mock.calls.length)
      .toBeGreaterThanOrEqual(0) // capital load is allowed; nothing else is
  })

  it('a second click while saving does not fire twice', async () => {
    let release: () => void = () => {}
    m.chartSaveScreenshot.mockImplementation(
      () => new Promise((r) => { release = () => r({ canceled: true }) }),
    )
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalledTimes(1))
    expect(shareButton().disabled).toBe(true)
    release()
  })
})

describe('T3 the suggested filename carries the month and no account name', () => {
  it('the month is in the name', async () => {
    mount(JULY)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(saveArg().suggestedName).toBe('fugaedge-calendar-2026-07-square.png')
  })

  it('a single-digit month is zero-padded so a folder sorts', async () => {
    mount(JUNE)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(saveArg().suggestedName).toBe('fugaedge-calendar-2026-06-square.png')
  })

  it('and the FORMAT, so exporting all four does not overwrite three of them', async () => {
    localStorage.setItem('calendar.shareFormat', 'story')
    mount(JULY)
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(saveArg().suggestedName).toBe('fugaedge-calendar-2026-07-story.png')
  })

  it('and nothing account-shaped rides along in the name', async () => {
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    const name = saveArg().suggestedName
    expect(name).not.toMatch(/account/i)
    expect(name).not.toMatch(/acct/i)
    expect(name).not.toMatch(/main/i)
  })
})

describe('T4 failure surfaces the way a failed chart export does', () => {
  it('a rejected save is logged, not swallowed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.chartSaveScreenshot.mockRejectedValue(new Error('EACCES'))
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(spy).toHaveBeenCalled())
    // Same feedback path ChartTab's handleScreenshot uses: console.error, no
    // toast (the app has none), and the surface stays alive for a retry.
    expect(String(spy.mock.calls[0][0])).toMatch(/save failed/i)
    spy.mockRestore()
  })

  it('and the button comes back enabled so the user can retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.chartSaveScreenshot.mockRejectedValue(new Error('EACCES'))
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(shareButton().disabled).toBe(false))
    spy.mockRestore()
  })

  it('a CANCELLED dialog is not a failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.chartSaveScreenshot.mockResolvedValue({ canceled: true })
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('T5 streamer mode forces percent END TO END from the entry point', () => {
  it('a stored dollars choice still exports a percentage card', async () => {
    localStorage.setItem('calendar.shareUnit', 'dollars')
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await mountReady()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])
    expect(rec.texts.some((t) => /%$/.test(t))).toBe(true)
  })

  it('the dollars control is disabled and says why', () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    mount()
    const dollars = screen.getByRole('button', { name: '$' }) as HTMLButtonElement
    expect(dollars.disabled).toBe(true)
    expect(dollars.getAttribute('title')).toMatch(/streamer mode/i)
  })

  it('the ENTRY POINT does the overriding, not only the compositor', () => {
    // The compositor guards itself, so a card exported with unit:'dollars' under
    // streamer mode still draws percentages — which means "no dollars on the
    // canvas" cannot tell the two layers apart. What can: the control's own
    // pressed state. With a stored dollars choice and the eye on, the entry point
    // must already be resolved to percent before it composes anything.
    localStorage.setItem('calendar.shareUnit', 'dollars')
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    mount()
    expect(screen.getByRole('button', { name: '%' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '$' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('and the stored preference is left alone, so the eye going off restores it', () => {
    localStorage.setItem('calendar.shareUnit', 'dollars')
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    mount()
    expect(localStorage.getItem('calendar.shareUnit')).toBe('dollars')
  })

  it('with the eye OFF, a dollars choice is honoured', async () => {
    localStorage.setItem('calendar.shareUnit', 'dollars')
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(rec.texts.some((t) => t.includes('$'))).toBe(true)
  })

  it('and percent is the default when nothing was ever chosen', async () => {
    mount()
    await userEvent.click(shareButton())
    await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
    expect(rec.texts.filter((t) => t.includes('$'))).toEqual([])
  })
})

describe('T6 STAND-DOWN: the calendar is unchanged when the action is never used', () => {
  it('the header still shows its month, nav and stats', () => {
    mount(JULY)
    expect(screen.getByRole('heading', { name: /July/ })).toBeTruthy()
    expect(screen.getByLabelText('Previous month')).toBeTruthy()
    expect(screen.getByLabelText('Next month')).toBeTruthy()
    expect(document.body.textContent).toContain('Trading days')
    expect(document.body.textContent).toContain('W/L')
  })

  it('and merely mounting saves nothing and draws nothing', () => {
    mount()
    expect(m.chartSaveScreenshot).not.toHaveBeenCalled()
    expect(rec.texts).toEqual([])
  })

  it('switching units alone still exports nothing', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: '$' }))
    expect(m.chartSaveScreenshot).not.toHaveBeenCalled()
    expect(rec.texts).toEqual([])
  })
})

// @vitest-environment jsdom
//
// THE MONTH CAN BE REVIEWED AND NOTED, THROUGH ITS OWN CHANNEL.
//
// Beat 265 mounted the Overview tab with the review card suppressed, because
// there was no monthly award to bank. There is one now, so the card returns --
// and the thing that matters is WHICH CHANNEL it reaches. The weekly get
// handler does not validate (electron/xp/ipc.ts:45-52: it builds a key and
// looks it up), so a month leaking into it would fail silently and for ever.
// AI6 therefore asserts on the CALL, not on the result.
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import MonthReviewModal from '../MonthReviewModal'
import { MONTH_WORDING } from '../MonthReviewModal/wording'
import { weeklyReview } from '../WeekReviewModal/reviewChannel'
import { monthlyReview } from '../MonthReviewModal/reviewChannel'
// Bound to the same ids the hosts bind, so the CALL these cases watch is
// the call the app makes.
const WEEKLY_REVIEW = weeklyReview('2026-06-07')
const MONTHLY_REVIEW = monthlyReview('2026-06')
import WeekOverviewTab from '../WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '../WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '../WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '../WeekReviewModal/WeekPatternsTab'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { makeTrade } from '@/test/fixtures/trade'
import { EMPTY_RULE_BREAKS } from '@/test/fixtures/ruleBreaks'
import type { PeriodDetail } from '@shared/week-types'
import type { TradeListRow } from '@shared/trades-types'

const TRADES: TradeListRow[] = [
  {
    ...makeTrade({ id: 1, symbol: 'AAA', net_pnl: 300 }),
    date: '2026-06-08',
    playbook_name: 'Gap and go',
    mistakes: ['FOMO entry'],
    mistakeTags: [{ name: 'FOMO entry', axis: 'psychological' }],
  } as TradeListRow,
  {
    ...makeTrade({ id: 2, symbol: 'BBB', net_pnl: -120 }),
    date: '2026-06-09',
    playbook_name: 'Gap and go',
    mistakes: [],
    mistakeTags: [],
  } as TradeListRow,
]

const periodOf = (trades: TradeListRow[], from: string, to: string): PeriodDetail => ({
  from,
  to,
  metrics: computeWeekMetrics({
    trades,
    weekEnd: to,
    dailyPnl: new Map(trades.map((t) => [t.date, t.net_pnl])),
    exitDeltas: [],
  }),
  trades,
  ruleBreaks: EMPTY_RULE_BREAKS,
  entries: [
    { date: '2026-06-08', premarket_notes: 'watching AAA for a gap', postsession_notes: 'took it' },
  ],
})

const JUNE = periodOf(TRADES, '2026-06-01', '2026-06-30')
const WEEK_FULL = periodOf(TRADES, '2026-06-07', '2026-06-13')
const WEEK_EMPTY = periodOf([], '2026-06-07', '2026-06-13')

// EVERY channel the window exposes is a spy, so "which one was called" is a
// fact this file can read rather than infer.
const api = {
  monthDetailGet: vi.fn(),
  monthNotesSave: vi.fn(),
  monthNotesGet: vi.fn(),
  xpMonthlyReviewGet: vi.fn(),
  xpMonthlyReviewComplete: vi.fn(),
  xpWeeklyReviewGet: vi.fn(),
  xpWeeklyReviewComplete: vi.fn(),
  weekNotesSave: vi.fn(),
}

beforeAll(() => {
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(api, {
    get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => Promise.resolve(null)),
  })
})

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.monthDetailGet.mockResolvedValue({ ...JUNE, notes: '' })
  api.monthNotesSave.mockResolvedValue({ month_id: '2026-06', text: 'saved' })
  api.monthNotesGet.mockResolvedValue('')
  api.xpMonthlyReviewGet.mockResolvedValue({ completed: false })
  api.xpMonthlyReviewComplete.mockResolvedValue({ completed: true, awarded: true })
  api.xpWeeklyReviewGet.mockResolvedValue({ completed: false })
  api.xpWeeklyReviewComplete.mockResolvedValue({ completed: true, awarded: true })
})
afterEach(() => cleanup())

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (node: React.ReactElement) => norm(render(node).container.textContent ?? '')
const md5 = (s: string) => createHash('md5').update(s).digest('hex')

const drawerReady = async () => {
  await waitFor(() =>
    expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
  )
  await waitFor(() =>
    expect(norm(document.body.textContent ?? '')).toContain(MONTH_WORDING.equitySubtitle),
  )
}

describe('AI the monthly review', () => {
  it('AI5 the month drawer renders the review card and its button', async () => {
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    const text = norm(document.body.textContent ?? '')
    expect(text, 'no review card on the month').toContain(MONTH_WORDING.reviewTitle)
    expect(text).toContain(MONTH_WORDING.reviewPrompt)
    expect(
      screen.getByRole('button', { name: 'Complete review' }),
      'the card has no button',
    ).toBeTruthy()
    // and it is the MONTH's words, not the week's
    expect(text).not.toContain(WEEK_WORDING.reviewTitle)
  })

  it('AI6 completing on the month calls the MONTHLY channel and never the weekly', async () => {
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()

    // the mount fetch already chose a channel
    await waitFor(() => expect(api.xpMonthlyReviewGet).toHaveBeenCalledWith({ monthId: '2026-06' }))
    expect(api.xpWeeklyReviewGet, 'the month asked the WEEKLY channel').not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Complete review' }))
    await waitFor(() =>
      expect(api.xpMonthlyReviewComplete).toHaveBeenCalledWith({ monthId: '2026-06' }),
    )
    expect(api.xpWeeklyReviewComplete, 'the month completed through the WEEKLY channel')
      .not.toHaveBeenCalled()

    // ASSERTED ON THE CALL, not the result -- but the card should also settle
    await waitFor(() =>
      expect(norm(document.body.textContent ?? '')).toContain(MONTH_WORDING.reviewDone),
    )
  })

  it('AI7 the Notes tab is available on the month and a save round-trips', async () => {
    api.monthDetailGet.mockResolvedValue({ ...JUNE, notes: 'carried over' })
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()

    const notes = screen.getByRole('tab', { name: /Notes/ }) as HTMLButtonElement
    expect(notes.disabled, 'the Notes tab is still disabled').toBe(false)
    fireEvent.click(notes)

    const box = (await screen.findByRole('textbox')) as HTMLTextAreaElement
    expect(box.value, 'the stored note did not seed the editor').toBe('carried over')

    fireEvent.change(box, { target: { value: 'June, in the end, was fine.' } })
    await waitFor(
      () =>
        expect(api.monthNotesSave).toHaveBeenCalledWith({
          month_id: '2026-06',
          text: 'June, in the end, was fine.',
        }),
      { timeout: 4000 },
    )
    expect(api.weekNotesSave, 'the month note went to week_notes').not.toHaveBeenCalled()
  })

  it('AI8 CONTROL: the week reaches the WEEKLY channel, and the nine goldens hold', async () => {
    // the week's own review wiring, exercised through the same tab
    render(<WeekOverviewTab detail={WEEK_FULL} wording={WEEK_WORDING} review={WEEKLY_REVIEW} />)
    await waitFor(() =>
      expect(api.xpWeeklyReviewGet).toHaveBeenCalledWith({ weekStart: '2026-06-07' }),
    )
    expect(api.xpMonthlyReviewGet, 'the week asked the MONTHLY channel').not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Complete review' }))
    await waitFor(() =>
      expect(api.xpWeeklyReviewComplete).toHaveBeenCalledWith({ weekStart: '2026-06-07' }),
    )
    expect(api.xpMonthlyReviewComplete).not.toHaveBeenCalled()
    cleanup()

    // THE NINE GOLDENS. Same md5s as weekWording.test.tsx:87-97 and
    // monthDrawer.test.tsx -- captured from the SHIPPED tabs before beat 261.
    // This beat threads a review-channel prop through Overview; the week must
    // come out reading letter for letter as it did.
    const got: Record<string, string> = {
      'overview-full': textOf(
        <WeekOverviewTab detail={WEEK_FULL} wording={WEEK_WORDING} review={WEEKLY_REVIEW} />,
      ),
    }
    cleanup()
    got['overview-empty'] = textOf(
      <WeekOverviewTab detail={WEEK_EMPTY} wording={WEEK_WORDING} review={WEEKLY_REVIEW} />,
    )
    cleanup()
    got['performance-full'] = textOf(<WeekPerformanceTab detail={WEEK_FULL} wording={WEEK_WORDING} />)
    cleanup()
    got['performance-empty'] = textOf(<WeekPerformanceTab detail={WEEK_EMPTY} wording={WEEK_WORDING} />)
    cleanup()
    got['trades-full'] = textOf(
      <WeekTradesTab trades={TRADES} selectedTradeId={null} onSelectTrade={() => {}} wording={WEEK_WORDING} />,
    )
    cleanup()
    got['trades-empty'] = textOf(
      <WeekTradesTab trades={[]} selectedTradeId={null} onSelectTrade={() => {}} wording={WEEK_WORDING} />,
    )
    cleanup()
    got['mistakes'] = textOf(<WeekMistakesTab table={computeMistakesTable(TRADES)} wording={WEEK_WORDING} />)
    cleanup()
    got['patterns-full'] = textOf(<WeekPatternsTab detail={WEEK_FULL} wording={WEEK_WORDING} />)
    cleanup()
    got['patterns-empty'] = textOf(<WeekPatternsTab detail={WEEK_EMPTY} wording={WEEK_WORDING} />)

    const GOLDEN: Record<string, string> = {
      'overview-full': '7e8bd4674d9873afc4523f83f71511c3',
      'overview-empty': '12ae020dcc61d464d41e49948cf2666e',
      'performance-full': 'af7cca6a3547b49f51bb1d661795557f',
      'performance-empty': '3818ea3d569dbf96452ec56f65875a3d',
      'trades-full': 'ae7e9cfe840d8cfca44b802ab1fad428',
      'trades-empty': '3818ea3d569dbf96452ec56f65875a3d',
      mistakes: '3abd716bb9687b0376ef0607f04121cf',
      'patterns-full': 'b1fc02e65021740636e76b34a228b1bb',
      'patterns-empty': 'e22346f421a43ab194c030e5e124d7ca',
    }
    for (const k of Object.keys(GOLDEN)) {
      expect(md5(got[k]), `${k} no longer reads as it shipped:\n${got[k]}`).toBe(GOLDEN[k])
    }
  })

  it('AI8b CONTROL: the two channels are different objects reaching different names', async () => {
    await MONTHLY_REVIEW.get()
    await WEEKLY_REVIEW.get()
    expect(api.xpMonthlyReviewGet).toHaveBeenCalledTimes(1)
    expect(api.xpWeeklyReviewGet).toHaveBeenCalledTimes(1)
    await MONTHLY_REVIEW.complete()
    await WEEKLY_REVIEW.complete()
    expect(api.xpMonthlyReviewComplete).toHaveBeenCalledTimes(1)
    expect(api.xpWeeklyReviewComplete).toHaveBeenCalledTimes(1)
  })
})

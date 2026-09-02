// @vitest-environment jsdom
//
// THE MONTH SHOWS THE WEEKS INSIDE IT.
//
// Each row is CLIPPED to the month, so the rows sum to the month exactly --
// that is what makes the ladder checkable rather than decorative, and it is
// asserted against getPeriodDetail in electron/month/__tests__/monthLadder
// .test.ts, not here. What this file guards is the SURFACE: that a row shows
// the clipped window it summed, and opens the whole week it came from.
//
// THOSE TWO ARE DIFFERENT WINDOWS AND THAT IS THE POINT. June 2026's first row
// shows Jun 1..6 -- six days -- and opens May 31..Jun 6. A row that showed the
// full week would overshoot the month; a row that opened the clipped window
// would hand the trader a fragment of a week and call it a weekly review.
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import MonthReviewModal from '../MonthReviewModal'
import WeekReviewModal from '../WeekReviewModal'
import DayDetailModal from '../DayDetailModal'
import { MONTH_WORDING } from '../MonthReviewModal/wording'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { weeklyReview } from '../WeekReviewModal/reviewChannel'
import WeekOverviewTab from '../WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '../WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '../WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '../WeekReviewModal/WeekPatternsTab'
import { monthWeekRows } from '@/core/calendar/monthWeeks'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { makeTrade } from '@/test/fixtures/trade'
import type { PeriodDetail, MonthWeekSummary } from '@shared/week-types'
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
  entries: [
    { date: '2026-06-08', premarket_notes: 'watching AAA for a gap', postsession_notes: 'took it' },
  ],
})

const JUNE = periodOf(TRADES, '2026-06-01', '2026-06-30')
const WEEK_FULL = periodOf(TRADES, '2026-06-07', '2026-06-13')
const WEEK_EMPTY = periodOf([], '2026-06-07', '2026-06-13')

/** The measured June ladder (scratch-267/logs/cost.log), with row 3 emptied so
 *  the absence shape has something to render. */
const LADDER: MonthWeekSummary[] = monthWeekRows('2026-06').map((r, i) => {
  const numbers = [
    { tradeCount: 30, netPnl: 630, tradingDays: 5, winRate: 0.53 },
    { tradeCount: 29, netPnl: 1482, tradingDays: 5, winRate: 0.69 },
    { tradeCount: 0, netPnl: 0, tradingDays: 0, winRate: null },
    { tradeCount: 37, netPnl: 418, tradingDays: 5, winRate: 0.65 },
    { tradeCount: 15, netPnl: 412, tradingDays: 2, winRate: 0.53 },
  ][i]
  return { ...r, ...numbers }
})

const api = {
  monthDetailGet: vi.fn(),
  monthNotesSave: vi.fn(),
  weekDetailGet: vi.fn(),
  // dayDetailGet is deliberately NOT listed: a bare vi.fn() returns
  // undefined and the day modal calls .then on it. The Proxy fallback
  // below answers every unlisted channel with a resolved null, which is
  // all AM1 needs -- the shell renders its tab strip before any data
  // lands.
  xpMonthlyReviewGet: vi.fn(),
  xpMonthlyReviewComplete: vi.fn(),
  xpWeeklyReviewGet: vi.fn(),
  xpWeeklyReviewComplete: vi.fn(),
}

beforeAll(() => {
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(api, {
    get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => Promise.resolve(null)),
  })
})

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.monthDetailGet.mockResolvedValue({ ...JUNE, notes: '', ladder: LADDER })
  api.weekDetailGet.mockResolvedValue({
    weekStart: '2026-05-31',
    weekEnd: '2026-06-06',
    metrics: WEEK_FULL.metrics,
    trades: TRADES,
    notes: '',
    entries: [],
  })
  api.xpMonthlyReviewGet.mockResolvedValue({ completed: false })
  api.xpWeeklyReviewGet.mockResolvedValue({ completed: false })
})
afterEach(() => cleanup())

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (node: React.ReactElement) => norm(render(node).container.textContent ?? '')
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
const WEEKLY = weeklyReview('2026-06-07')

const drawerReady = async () => {
  await waitFor(() =>
    expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
  )
  await waitFor(() =>
    expect(norm(document.body.textContent ?? '')).toContain(MONTH_WORDING.equitySubtitle),
  )
}

/** Renders the drawer and switches to the ladder. The render belongs HERE:
 *  three cases called this without one and failed at drawerReady for a reason
 *  that had nothing to do with the ladder. */
const openLadder = async (opts: { onOpenWeek?: (w: string) => void } = {}) => {
  render(<MonthReviewModal monthId="2026-06" onClose={() => {}} onOpenWeek={opts.onOpenWeek} />)
  await drawerReady()
  fireEvent.click(screen.getByRole('tab', { name: /Weeks/ }))
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
  return screen.getByRole('table')
}

describe('AM the weeks ladder', () => {
  it('AM1 the month host renders SEVEN tabs; the week and day hosts do not gain one', async () => {
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    const monthTabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    expect(monthTabs.length, `month tabs: ${monthTabs.join(', ')}`).toBe(7)
    expect(monthTabs.some((t) => /Weeks/.test(t ?? ''))).toBe(true)
    cleanup()

    render(<WeekReviewModal weekStart="2026-06-07" onClose={() => {}} />)
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
    const weekTabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    expect(weekTabs.length, `week tabs: ${weekTabs.join(', ')}`).toBe(6)
    expect(weekTabs.some((t) => /Weeks/.test(t ?? '')), 'the week host grew a Weeks tab').toBe(false)
    cleanup()

    render(<DayDetailModal date="2026-06-08" onClose={() => {}} />)
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
    const dayTabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    expect(dayTabs.length, `day tabs: ${dayTabs.join(', ')}`).toBe(6)
    expect(dayTabs.some((t) => /Weeks/.test(t ?? '')), 'the day host grew a Weeks tab').toBe(false)
  })

  it('AM2 each row shows its clipped label, day count, trades, net and win rate', async () => {
    const table = await openLadder()
    const rows = table.querySelectorAll('tbody tr')
    expect(rows.length, 'the ladder is not five rows').toBe(5)

    const second = norm(rows[1].textContent ?? '')
    expect(second, 'no clipped label').toContain('Jun 7')
    expect(second).toContain('Jun 13')
    expect(second, 'no day count').toMatch(/\b7\b/)
    expect(second, 'no trade count').toContain('29')
    expect(second, 'no net').toContain('1,482')
    expect(second, 'no win rate').toContain('69%')
  })

  it('AM3 a straddling row labels its CLIPPED range, not the full week', async () => {
    const table = await openLadder()
    const first = norm(table.querySelectorAll('tbody tr')[0].textContent ?? '')
    // The clipped window: Jun 1 .. Jun 6, six days.
    expect(first, 'the first row does not name its clipped start').toContain('Jun 1')
    expect(first).toContain('Jun 6')
    // The FULL week it opens starts May 31 -- which must NOT be the label.
    expect(first, 'the row is labelled with the full week, not the clip').not.toContain('May 31')
    expect(first, 'the day count is the full seven').not.toMatch(/\b7 days\b/)

    const last = norm(table.querySelectorAll('tbody tr')[4].textContent ?? '')
    expect(last).toContain('Jun 28')
    expect(last).toContain('Jun 30')
    expect(last, 'the trailing straddle shows July').not.toContain('Jul')
  })

  it('AM4b the row carries the FULL week start to its handler', async () => {
    // The page-level proof -- that the WEEK DRAWER opens on the full range --
    // is AM4 in src/pages/__tests__/Calendar.ladder.test.tsx. This is the
    // component half: what the row hands upward.
    const opened: string[] = []
    const table = await openLadder({ onOpenWeek: (w) => opened.push(w) })
    fireEvent.click(table.querySelectorAll('tbody tr')[0])
    expect(opened, 'the row opened the CLIPPED window, not the week').toEqual(['2026-05-31'])
    fireEvent.click(table.querySelectorAll('tbody tr')[1])
    expect(opened).toEqual(['2026-05-31', '2026-06-07'])
  })

  it('AM5 a week with no trades in the month is an ABSENCE, not a zero row', async () => {
    const table = await openLadder()
    const rows = table.querySelectorAll('tbody tr')
    const empty = norm(rows[2].textContent ?? '')
    // THE ROW IS STILL THERE -- the ladder tiles the month, and a missing row
    // would break the partition the trader can see.
    expect(empty, 'the untraded week vanished from the ladder').toContain('Jun 14')
    // ...but it says nothing it did not earn: no $0.00, no 0%, no "0 trades".
    expect(empty, 'a fabricated zero P&L').not.toContain('0.00')
    expect(empty, 'a fabricated win rate').not.toContain('0%')
    expect(empty, 'an em dash absence is missing').toContain('—')

    // CONTROL: a traded row in the same table DOES show its numbers, so the
    // absence above is the empty state and not a broken render.
    expect(norm(rows[1].textContent ?? '')).toContain('1,482')
  })

  it('AM6 CONTROL: the nine week goldens are byte-identical', () => {
    const got: Record<string, string> = {
      'overview-full': textOf(
        <WeekOverviewTab detail={WEEK_FULL} wording={WEEK_WORDING} review={WEEKLY} />,
      ),
    }
    cleanup()
    got['overview-empty'] = textOf(
      <WeekOverviewTab detail={WEEK_EMPTY} wording={WEEK_WORDING} review={WEEKLY} />,
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

  it('AM7 CONTROL: the six existing month tabs are unchanged, in order and in wording', async () => {
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    const labels = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    // the six, in their shipped order, with Weeks APPENDED -- not inserted
    expect(labels.slice(0, 6)).toEqual([
      'Overview',
      'Performance',
      'Trades',
      'Mistakes',
      'Patterns',
      'Notes',
    ])
    // and the Overview tab still says everything it said before
    const text = norm(document.body.textContent ?? '')
    expect(text).toContain(MONTH_WORDING.reviewTitle)
    expect(text).toContain(MONTH_WORDING.reviewPrompt)
    expect(text).toContain(MONTH_WORDING.equitySubtitle)
    // every tab still enabled
    for (const t of screen.getAllByRole('tab')) {
      expect((t as HTMLButtonElement).disabled, `${t.textContent} is disabled`).toBe(false)
    }
  })
})

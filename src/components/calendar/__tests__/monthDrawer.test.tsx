// @vitest-environment jsdom
//
// A MONTH TILE OPENS A DRAWER. The window is the primitive (beat 260), the
// wording is the host's (beat 261), and the shell has taken its tabs as a prop
// since Day 4.5a — so a month host is a host, not a second implementation.
//
// WHAT THIS BEAT DOES NOT BUILD. There is no month_notes table and no monthly
// XP, so the Notes tab is present but NOT AVAILABLE, and the Overview tab's
// review card is omitted outright. A write surface with nowhere to write and a
// button that awards nothing are both worse than an honestly disabled tab.
//
// AG5 IS THE TRIPWIRE. The nine md5s are the ones weekWording.test.tsx:87-97
// already asserts, captured from the SHIPPED tabs before beat 261 moved the
// wording. They are repeated here deliberately: this beat widens three tab
// prop types and threads a new prop through Overview, and the week drawer has
// to come out the other side reading letter for letter as it did. Two files
// asserting the same fact from different entry points is the point, not a
// duplication to tidy away.
import { render, cleanup, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import MonthReviewModal from '../MonthReviewModal'
import { MONTH_WORDING } from '../MonthReviewModal/wording'
import { weeklyReview } from '../WeekReviewModal/reviewChannel'
import WeekOverviewTab from '../WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '../WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '../WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '../WeekReviewModal/WeekPatternsTab'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { monthWindow, monthIdsOfYear, monthLabel } from '@/core/calendar/monthWindow'
import { getNavPosition } from '@/core/trades/tradeNavigation'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { makeTrade } from '@/test/fixtures/trade'
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

/** The same fixture weekWording.test.tsx uses, in PERIOD shape. */
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

const monthDetailGet = vi.fn()

beforeAll(() => {
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(
    { monthDetailGet },
    {
      get: (t: Record<string, unknown>, k: string) =>
        k in t ? t[k] : () => Promise.resolve(null),
    },
  )
})
beforeEach(() => {
  monthDetailGet.mockReset()
  monthDetailGet.mockResolvedValue(JUNE)
})
afterEach(() => cleanup())

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (node: React.ReactElement) => norm(render(node).container.textContent ?? '')
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
// The week's own review pair, bound to the fixture's Sunday. Beat 266 made
// the card conditional on being handed one, so the golden renders below
// must pass it or they would be measuring a tab with no card.
const WEEKLY = weeklyReview('2026-06-07')

/** Wait until the drawer has actually PAINTED its loaded content.
 *
 *  A single macrotask tick is not enough: the fetch promise chain and React's
 *  commit do not reliably land in one, and under a loaded runner they
 *  sometimes do not. That was a real flake (1 run in 10) and it made every
 *  absence-assertion below vacuous into the bargain -- "the review card is not
 *  on screen" passes trivially while nothing is on screen at all. Every case
 *  that renders the host now waits on something POSITIVE first. */
const drawerReady = async () => {
  await waitFor(() =>
    expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
  )
  await waitFor(() =>
    expect(norm(document.body.textContent ?? '')).toContain(MONTH_WORDING.equitySubtitle),
  )
}

describe('AG the month drawer', () => {
  it('AG1 the month host renders its tabs on a month window, headed by the month', async () => {
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()

    for (const label of ['Overview', 'Performance', 'Trades', 'Mistakes', 'Patterns', 'Notes']) {
      expect(screen.getByRole('tab', { name: new RegExp(label) }), `no ${label} tab`).toBeTruthy()
    }
    // BEAT 265 ASSERTED SIX. Beat 267 appended the Weeks ladder, so the count
    // moved by design -- AM1 in monthLadder.test.tsx owns the number and
    // checks the week and day hosts did NOT move with it. What matters here,
    // and what AM1 does not say, is that the original six are still the FIRST
    // six: a tab inserted among them would pass a count and still move every
    // tab a trader reaches for.
    expect(
      screen.getAllByRole('tab').map((t) => t.textContent?.trim()).slice(0, 6),
      'the original six tabs moved',
    ).toEqual(['Overview', 'Performance', 'Trades', 'Mistakes', 'Patterns', 'Notes'])

    // THE HEADER IS THE MONTH, NOT A RANGE. The week says
    // "June 7, 2026 → June 13, 2026"; a month that borrowed that shape would
    // read "June 1, 2026 → June 30, 2026" and pass a weaker assertion.
    const title = document.getElementById('month-review-title')
    expect(title, 'the month host has no titled heading').toBeTruthy()
    expect(title?.textContent).toBe('June 2026')
    expect(title?.textContent ?? '', 'the header is a date range').not.toContain('→')

    // and it asked for the month's own window, calendar days, not grid weeks
    expect(monthDetailGet).toHaveBeenCalledWith('2026-06', expect.anything())
  })

  it('AG2 the month wording says month everywhere the week said week', () => {
    // FIELD BY FIELD, not one sampled string: wherever the week's word appears
    // the month's must, and nowhere may the week's word survive.
    const keys = Object.keys(WEEK_WORDING) as (keyof typeof WEEK_WORDING)[]
    expect(keys.length, 'the wording lost a field').toBe(13)
    const offenders: string[] = []
    for (const k of keys) {
      const w = WEEK_WORDING[k]
      const m = MONTH_WORDING[k]
      if (/\bweeks?\b/i.test(w) && !/\bmonths?\b/i.test(m)) offenders.push(`${k}: month word missing`)
      if (/\bweeks?\b/i.test(m)) offenders.push(`${k}: the week word survived — ${m}`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])

    // and it is the HOST's word that reaches the DOM, driven through a real tab
    expect(textOf(<WeekPerformanceTab detail={JUNE} wording={MONTH_WORDING} />)).toContain(
      'Which days carried the month.',
    )
  })

  it('AG2b the HOST is what supplies them — asserted through the drawer', async () => {
    // AG2 above compares the two wording CONSTANTS and hands MONTH_WORDING
    // straight to a tab. Neither touches the host, so a host that imported the
    // WEEK's wording passed both — a real gap, found by plant AH1 and closed
    // here. This renders the drawer and reads what the DOM actually says.
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    const text = norm(document.body.textContent ?? '')
    expect(text, 'the drawer is not showing the month wording').toContain(
      MONTH_WORDING.equitySubtitle,
    )
    expect(text, "the host is handing the tabs the WEEK's words").not.toContain(
      WEEK_WORDING.equitySubtitle,
    )
  })

  it('AG3 the arrows walk twelve month ids, and stop at the ends', () => {
    const ids = monthIdsOfYear(2026)
    expect(ids.length, 'a year is not twelve months').toBe(12)
    expect(ids[0]).toBe('2026-01')
    expect(ids[11]).toBe('2026-12')
    expect([...ids].sort(), 'the ids are not in calendar order').toEqual(ids)

    const june = getNavPosition(ids, '2026-06')
    expect(june.prevId).toBe('2026-05')
    expect(june.nextId).toBe('2026-07')
    expect(june.index).toBe(5)
    expect(june.total).toBe(12)

    expect(getNavPosition(ids, '2026-01').prevId, 'January has a previous month').toBe(null)
    expect(getNavPosition(ids, '2026-12').nextId, 'December has a next month').toBe(null)
  })

  it('AG4b the host asks for the month window the pure function defines', async () => {
    // The MAIN-side equality against getPeriodDetail is AG4, in
    // electron/month/__tests__/monthDetail.test.ts. This half pins the
    // renderer: the id it sends resolves to calendar days, never grid weeks.
    expect(monthWindow('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(monthWindow('2026-02'), 'February is not a whole month').toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(monthWindow('2024-02'), 'a leap February lost its 29th').toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
    expect(monthLabel('2026-06')).toBe('June 2026')
  })

  it('AG5 CONTROL: the week tabs still render byte-identically to the goldens', () => {
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

  it('AG7 the month never wears the WEEK review wording, and no channel means no card', async () => {
    // BEAT 265 ASSERTED THE OPPOSITE: that the month showed no review card at
    // all, because there was no monthly award to bank. There is one now (AI5
    // watches it render), so what is left to guard is the part that would fail
    // silently -- the month wearing the week's words, and a tab with no
    // channel quietly rendering a button that reaches nothing.
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    const text = norm(document.body.textContent ?? '')
    expect(text, "the month is wearing the week's review words").not.toContain(
      WEEK_WORDING.reviewTitle,
    )
    expect(text, 'the month has its own review card').toContain(MONTH_WORDING.reviewTitle)
    cleanup()

    // NO CHANNEL, NO CARD -- the tab-level contract, which is what makes the
    // card and the wiring one fact instead of two that could disagree.
    const bare = textOf(<WeekOverviewTab detail={WEEK_FULL} wording={WEEK_WORDING} />)
    expect(bare, 'a review button with nothing behind it').not.toContain('Complete review')
    expect(bare).not.toContain(WEEK_WORDING.reviewTitle)
    cleanup()

    // CONTROL: handed one, the very same tab does render it.
    const wired = textOf(
      <WeekOverviewTab detail={WEEK_FULL} wording={WEEK_WORDING} review={WEEKLY} />,
    )
    expect(wired, 'the card never renders at all').toContain('Complete review')
    expect(wired).toContain(WEEK_WORDING.reviewTitle)
  })

  it('AG7b the Notes tab is available now that month_notes exists', async () => {
    // BEAT 265 ASSERTED THE OPPOSITE, and said why: a notes editor with no
    // table to save into is worse than a tab you can see is not ready. The
    // table landed this beat, so the tab is live. AI7 drives the round trip.
    render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
    await drawerReady()
    for (const label of ['Overview', 'Performance', 'Trades', 'Mistakes', 'Patterns', 'Notes']) {
      const tab = screen.getByRole('tab', { name: new RegExp(label) }) as HTMLButtonElement
      expect(tab.disabled, `${label} is disabled on the month`).toBe(false)
    }
  })
})

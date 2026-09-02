// @vitest-environment jsdom
//
// THE WEEK AND THE MONTH SHOW THE RULES BROKEN INSIDE THEM.
//
// ONE COMPONENT, TWO HOSTS -- the MistakesTableView precedent. What differs
// from that reference is the GRAIN and therefore the columns: rule breaks are
// keyed on a DAY (journal_rule_break's primary key is (date,
// rule_break_def_id), with no trade column), and rule_break_def carries no
// axis, so there is no axis grouping and Days stands where Mistakes has
// Trades.
//
// THE TWO NUMBERS ARE DIFFERENT ON PURPOSE, and that is the J5 class: the
// headline counts DAYS, once each, while a day that broke two rules earns a
// row under both. The fixture below has exactly such a day, so the two numbers
// genuinely differ and neither can be derived from the other by a test that
// only looked at one.
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import MonthReviewModal from '../MonthReviewModal'
import WeekReviewModal from '../WeekReviewModal'
import RuleBreaksTableView from '../RuleBreaksTableView'
import { MONTH_RULE_BREAKS_WORDING } from '../MonthReviewModal/ruleBreaksWording'
import { WEEK_RULE_BREAKS_WORDING } from '../WeekReviewModal/ruleBreaksWording'
import { MONTH_WORDING } from '../MonthReviewModal/wording'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { weeklyReview } from '../WeekReviewModal/reviewChannel'
import WeekOverviewTab from '../WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '../WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '../WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '../WeekReviewModal/WeekPatternsTab'
import RuleBreaksEditor from '../RuleBreaksEditor'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { monthWeekRows } from '@/core/calendar/monthWeeks'
import { makeTrade } from '@/test/fixtures/trade'
import { EMPTY_RULE_BREAKS } from '@/test/fixtures/ruleBreaks'
import type { PeriodDetail } from '@shared/week-types'
import type { RuleBreaksAnalytics } from '@shared/analytics-types'
import type { TradeListRow } from '@shared/trades-types'

/** THE DOUBLED DAY IS THE POINT. Three days carry a break; one of them carries
 *  two, so the four row day-counts sum to four against a headline of three. */
const ROLLUP: RuleBreaksAnalytics = {
  byRuleBreak: [
    { label: 'Ignored daily max loss', day_count: 2, net_pnl: -300, avg_pnl_per_day: -150, green_day_rate: 0 },
    { label: 'Overtrading', day_count: 1, net_pnl: -120, avg_pnl_per_day: -120, green_day_rate: 0 },
    { label: 'Chased an extended entry', day_count: 1, net_pnl: 270, avg_pnl_per_day: 270, green_day_rate: 1 },
  ],
  days_with_any_break: 3,
  clean_days: 2,
  flawed_day_net_pnl: -150,
  clean_day_net_pnl: 400,
  flawed_green_rate: 1 / 3,
  clean_green_rate: 0.5,
}

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

const periodOf = (
  trades: TradeListRow[],
  from: string,
  to: string,
  ruleBreaks: RuleBreaksAnalytics = EMPTY_RULE_BREAKS,
): PeriodDetail => ({
  from,
  to,
  metrics: computeWeekMetrics({
    trades,
    weekEnd: to,
    dailyPnl: new Map(trades.map((t) => [t.date, t.net_pnl])),
    exitDeltas: [],
  }),
  trades,
  ruleBreaks,
  entries: [
    { date: '2026-06-08', premarket_notes: 'watching AAA for a gap', postsession_notes: 'took it' },
  ],
})

const JUNE = periodOf(TRADES, '2026-06-01', '2026-06-30', ROLLUP)
const WEEK_FULL = periodOf(TRADES, '2026-06-07', '2026-06-13', ROLLUP)
const WEEK_EMPTY = periodOf([], '2026-06-07', '2026-06-13')

const api = {
  monthDetailGet: vi.fn(),
  weekDetailGet: vi.fn(),
  monthNotesSave: vi.fn(),
  weekNotesSave: vi.fn(),
  xpMonthlyReviewGet: vi.fn(),
  xpWeeklyReviewGet: vi.fn(),
  settingsGet: vi.fn(),
}

beforeAll(() => {
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(api, {
    get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => Promise.resolve(null)),
  })
})

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.monthDetailGet.mockResolvedValue({
    ...JUNE,
    notes: '',
    ladder: monthWeekRows('2026-06').map((r) => ({
      ...r, tradeCount: 0, netPnl: 0, tradingDays: 0, winRate: null,
    })),
  })
  api.weekDetailGet.mockResolvedValue({
    weekStart: '2026-06-07',
    weekEnd: '2026-06-13',
    metrics: WEEK_FULL.metrics,
    trades: TRADES,
    notes: '',
    ruleBreaks: ROLLUP,
    entries: [],
  })
  api.xpMonthlyReviewGet.mockResolvedValue({ completed: false })
  api.xpWeeklyReviewGet.mockResolvedValue({ completed: false })
  api.settingsGet.mockResolvedValue({ values: { daily_rule_break_list: ['Overtrading', 'Chased'] } })
})
afterEach(() => cleanup())

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (node: React.ReactElement) => norm(render(node).container.textContent ?? '')
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
const WEEKLY = weeklyReview('2026-06-07')

const monthReady = async () => {
  render(<MonthReviewModal monthId="2026-06" onClose={() => {}} />)
  await waitFor(() =>
    expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
  )
  await waitFor(() =>
    expect(norm(document.body.textContent ?? '')).toContain(MONTH_WORDING.equitySubtitle),
  )
}

const weekReady = async () => {
  render(<WeekReviewModal weekStart="2026-06-07" onClose={() => {}} />)
  await waitFor(() =>
    expect(norm(document.body.textContent ?? '')).toContain(WEEK_WORDING.equitySubtitle),
  )
}

const openRuleBreaks = async () => {
  fireEvent.click(screen.getByRole('tab', { name: /Rule Breaks/ }))
  return await screen.findByRole('table')
}

describe('AQ the rule breaks tab', () => {
  it('AQ1 the WEEK tab renders a row per label with days, net, average and green rate', async () => {
    await weekReady()
    const table = await openRuleBreaks()
    const rows = table.querySelectorAll('tbody tr')
    expect(rows.length, 'the table is not three rows').toBe(3)
    // READ THE CELLS, not the row's flattened text: normalised, that text
    // runs "Ignored daily max loss2-$300.00..." and a word-boundary regex
    // cannot see the 2 at all -- there is no boundary between the s and the
    // digit. Cell by cell is both correct and stricter.
    const cells = (tr: Element) =>
      Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent ?? ''))
    expect(cells(rows[0]), 'the first row is not label/days/net/avg/rate').toEqual([
      'Ignored daily max loss',
      '2',
      '-$300.00',
      '-$150.00',
      '0%',
    ])
    expect(cells(rows[1])).toEqual(['Overtrading', '1', '-$120.00', '-$120.00', '0%'])
    expect(cells(rows[2])).toEqual([
      'Chased an extended entry',
      '1',
      '+$270.00',
      '$270.00',
      '100%',
    ])
    // and the WEEK wears its own words, not the month's
    const wtext = norm(document.body.textContent ?? '')
    expect(wtext).toContain(WEEK_RULE_BREAKS_WORDING.title)
    expect(wtext, "the week is wearing the month's words").not.toContain(
      MONTH_RULE_BREAKS_WORDING.title,
    )
  })

  it('AQ2 the MONTH tab does the same, through the same component', async () => {
    await monthReady()
    const table = await openRuleBreaks()
    expect(table.querySelectorAll('tbody tr').length).toBe(3)
    const text = norm(document.body.textContent ?? '')
    for (const label of ROLLUP.byRuleBreak.map((r) => r.label)) {
      expect(text, `${label} missing on the month`).toContain(label)
    }
    // THE HOST'S OWN WORDS, read out of the DOM. The row labels above come
    // from the DATA, so a month host importing the WEEK's wording passed
    // this case untouched -- found by plant AR3, the same gap beat 265's
    // AH1 found, closed the same way.
    expect(text, 'the month is not showing its own title').toContain(
      MONTH_RULE_BREAKS_WORDING.title,
    )
    expect(text, "the month is wearing the week's rule-break words").not.toContain(
      WEEK_RULE_BREAKS_WORDING.title,
    )
    // THE SAME COMPONENT, not a second copy: rendered bare it produces the
    // same rows the drawer just showed.
    cleanup()
    const bare = textOf(
      <RuleBreaksTableView data={ROLLUP} wording={MONTH_RULE_BREAKS_WORDING} />,
    )
    for (const label of ROLLUP.byRuleBreak.map((r) => r.label)) {
      expect(bare).toContain(label)
    }
  })

  it('AQ3 both toplines render: days with a break, and the flawed-day net', async () => {
    await weekReady()
    await openRuleBreaks()
    const text = norm(document.body.textContent ?? '')
    expect(text, 'the headline day count is missing').toContain('3')
    expect(text, 'the flawed-day net is missing').toContain('150')
    expect(text, 'the clean side is missing').toContain('2')
  })

  it('AQ4 the row day-counts SUM HIGHER than the headline, and BOTH render', async () => {
    const sum = ROLLUP.byRuleBreak.reduce((a, r) => a + r.day_count, 0)
    expect(sum, 'the fixture has no doubled day -- it cannot tell the two apart').toBe(4)
    expect(ROLLUP.days_with_any_break).toBe(3)
    expect(sum).toBeGreaterThan(ROLLUP.days_with_any_break)

    const bare = textOf(<RuleBreaksTableView data={ROLLUP} wording={WEEK_RULE_BREAKS_WORDING} />)
    // THE HEADLINE IS 3 AND IS NOT THE ROW SUM. Nothing on this surface may
    // print 4 as a total.
    expect(bare).toContain('3')
    const totalsHalf = bare.slice(0, bare.indexOf(ROLLUP.byRuleBreak[0].label))
    expect(totalsHalf, 'the headline summed the rows').not.toContain('4')
    // and every row's own count is on screen
    for (const r of ROLLUP.byRuleBreak) {
      expect(bare).toContain(r.label)
    }
    // the footnote explains the gap
    expect(bare.toLowerCase()).toContain('more than one rule')
  })

  it('AQ5 an empty rollup renders an EMPTY STATE, not zeros', () => {
    const bare = textOf(<RuleBreaksTableView data={EMPTY_RULE_BREAKS} wording={WEEK_RULE_BREAKS_WORDING} />)
    expect(bare, 'the empty state is missing').toContain(WEEK_RULE_BREAKS_WORDING.empty)
    // NO FABRICATED NUMBERS: no zero counts, no $0.00, no 0%.
    expect(bare, 'a fabricated zero net').not.toContain('0.00')
    expect(bare, 'a fabricated rate').not.toContain('0%')
    // CONTROL: the populated table DOES print numbers, so the absence above is
    // the empty state and not a broken render.
    cleanup()
    expect(textOf(<RuleBreaksTableView data={ROLLUP} wording={WEEK_RULE_BREAKS_WORDING} />))
      .toContain('0%')
  })

  it('AQ6 the tab sits at POSITION FIVE on both hosts, asserted by ORDER', async () => {
    await weekReady()
    const weekTabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    expect(weekTabs, 'the week tab order moved').toEqual([
      'Overview', 'Performance', 'Trades', 'Mistakes', 'Rule Breaks', 'Patterns', 'Notes',
    ])
    cleanup()
    await monthReady()
    const monthTabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim())
    expect(monthTabs, 'the month tab order moved').toEqual([
      'Overview', 'Performance', 'Trades', 'Mistakes', 'Rule Breaks', 'Patterns', 'Notes', 'Weeks',
    ])
  })

  it('AQ7 CONTROL: the day editor is untouched and still renders toggle chips', async () => {
    const src = readFileSync(join(process.cwd(), 'src/components/calendar/RuleBreaksEditor.tsx'))
    expect(
      createHash('md5').update(src).digest('hex'),
      'the day editor was modified -- it writes, these tabs read',
    ).toBe('a80759d13712fc092a53ec7bde4ff70a')
    render(<RuleBreaksEditor date="2026-06-08" breaks={['Overtrading']} onChange={() => {}} />)
    const chip = await screen.findByRole('button', { name: 'Overtrading' })
    expect(chip.getAttribute('aria-pressed'), 'the chip lost its toggle state').toBe('true')
    expect(screen.getByRole('button', { name: 'Chased' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('AQ8 CONTROL: the nine week goldens are byte-identical', () => {
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

  it('AQ9 the component types no period noun of its own', () => {
    // ASSERTED ON THE SOURCE, BY BYTE, scoped to string literals and JSX text
    // -- not on rendered output, which would pass the moment a host happened
    // to supply the right word. The AE3 shape.
    const src = readFileSync(
      join(process.cwd(), 'src/components/calendar/RuleBreaksTableView.tsx'),
      'utf-8',
    )
    const offenders: string[] = []
    src.split('\n').forEach((line, i) => {
      const s = line.trim()
      if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return
      if (s.startsWith('import ')) return
      const noun = /\b(week|weeks|month|months|day|days|period)\b/i
      const inLiteral = /'[^']*'|"[^"]*"/.test(s) && noun.test(s.match(/'[^']*'|"[^"]*"/)?.[0] ?? '')
      const inJsxText = /^[^<>{}]*$/.test(s) && noun.test(s) && !/^\w+[:(]/.test(s)
      if (inLiteral || inJsxText) offenders.push(`${i + 1}  ${s}`)
    })
    expect(offenders, `the component names a period itself:\n${offenders.join('\n')}`).toEqual([])
  })
})

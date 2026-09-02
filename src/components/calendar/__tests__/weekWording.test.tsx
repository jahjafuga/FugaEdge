// @vitest-environment jsdom
//
// THE PERIOD'S WORDING IS THE HOST'S, NOT THE TAB'S.
//
// Five of the six review tabs hardcoded the noun "week" — sixteen strings.
// Every number they render was already period-agnostic, so the wording was the
// only thing tying them to seven days. DetailNotesTab never had the problem:
// its host passes `label` and `placeholder` (WeekReviewModal/index.tsx:182
// passes "Week notes"), and the other five now follow it.
//
// AE1 IS A GOLDEN, CAPTURED FROM THE SHIPPED TABS BEFORE THE MOVE. The strings
// below are what the weekly drawer rendered on the fixture at the moment this
// beat opened, taken by rendering each tab twice and checking the two agreed.
// They are inlined rather than read from disk so this file needs nothing
// outside the repo and keeps standing after the beat closes.
//
// NOTHING HERE ADDS MONTH WORDING. AE2 drives "quarter" precisely because it
// is a word this app does not use — a wording the host supplies has to be
// arbitrary, and a month host that does not exist yet cannot be the proof.
import { render, cleanup } from '@testing-library/react'
import { describe, expect, it, afterEach, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import WeekOverviewTab from '../WeekReviewModal/WeekOverviewTab'
import WeekPerformanceTab from '../WeekReviewModal/WeekPerformanceTab'
import WeekTradesTab from '../WeekReviewModal/WeekTradesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeekPatternsTab from '../WeekReviewModal/WeekPatternsTab'
import { WEEK_WORDING } from '../WeekReviewModal/wording'
import { computeWeekMetrics } from '@/core/analytics/week'
import { computeMistakesTable } from '@/core/analytics/mistakes'
import { makeTrade } from '@/test/fixtures/trade'
import type { PeriodWording } from '@shared/period-wording'
import type { WeekDetail } from '@shared/week-types'
import type { TradeListRow } from '@shared/trades-types'

// WeekOverviewTab reads the weekly-review XP state on mount, so window.api
// must exist before anything renders.
beforeAll(() => {
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(
    {},
    { get: () => () => Promise.resolve(null) },
  )
})
afterEach(() => cleanup())

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

const detailOf = (trades: TradeListRow[]): WeekDetail => ({
  weekStart: '2026-06-07',
  weekEnd: '2026-06-13',
  metrics: computeWeekMetrics({
    trades,
    weekEnd: '2026-06-13',
    dailyPnl: new Map(trades.map((t) => [t.date, t.net_pnl])),
    exitDeltas: [],
  }),
  trades,
  notes: '',
  entries: [
    { date: '2026-06-08', premarket_notes: 'watching AAA for a gap', postsession_notes: 'took it' },
  ],
})

const FULL = detailOf(TRADES)
const EMPTY = detailOf([])
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (node: React.ReactElement) => norm(render(node).container.textContent ?? '')

/** THE GOLDEN — every md5 taken from the SHIPPED tabs before the move. */
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
const md5 = (s: string) => createHash('md5').update(s).digest('hex')

describe('AE the period wording moves to the host, invisibly', () => {
  it('AE1 every tab renders byte-identically to the golden under the WEEK host', () => {
    const got: Record<string, string> = {
      'overview-full': textOf(<WeekOverviewTab detail={FULL} wording={WEEK_WORDING} />),
    }
    cleanup()
    got['overview-empty'] = textOf(<WeekOverviewTab detail={EMPTY} wording={WEEK_WORDING} />)
    cleanup()
    got['performance-full'] = textOf(<WeekPerformanceTab detail={FULL} wording={WEEK_WORDING} />)
    cleanup()
    got['performance-empty'] = textOf(<WeekPerformanceTab detail={EMPTY} wording={WEEK_WORDING} />)
    cleanup()
    got['trades-full'] = textOf(
      <WeekTradesTab trades={FULL.trades} selectedTradeId={null} onSelectTrade={() => {}} wording={WEEK_WORDING} />,
    )
    cleanup()
    got['trades-empty'] = textOf(
      <WeekTradesTab trades={[]} selectedTradeId={null} onSelectTrade={() => {}} wording={WEEK_WORDING} />,
    )
    cleanup()
    got['mistakes'] = textOf(
      <WeekMistakesTab table={computeMistakesTable(TRADES)} wording={WEEK_WORDING} />,
    )
    cleanup()
    got['patterns-full'] = textOf(<WeekPatternsTab detail={FULL} wording={WEEK_WORDING} />)
    cleanup()
    got['patterns-empty'] = textOf(<WeekPatternsTab detail={EMPTY} wording={WEEK_WORDING} />)

    for (const k of Object.keys(GOLDEN)) {
      expect(md5(got[k]), `${k} no longer reads as it shipped:\n${got[k]}`).toBe(GOLDEN[k])
    }
  })

  it('AE2 a tab renders the wording it is GIVEN, not a word of its own', () => {
    // "quarter" is deliberately a word this app does not use anywhere, so a
    // tab that still had its own noun could not accidentally pass.
    const QUARTER: PeriodWording = {
      ...WEEK_WORDING,
      noTrades: 'No trades this quarter.',
      patternsTitle: 'Patterns this quarter',
      streakLabel: 'Streak into next quarter',
      dayByDaySubtitle: 'Which days carried the quarter.',
      mistakesSubtitle: "Aggregated across the quarter's trades.",
    }
    expect(textOf(<WeekPatternsTab detail={EMPTY} wording={QUARTER} />)).toContain('Patterns this quarter')
    cleanup()
    expect(textOf(<WeekTradesTab trades={[]} selectedTradeId={null} onSelectTrade={() => {}} wording={QUARTER} />))
      .toContain('No trades this quarter.')
    cleanup()
    expect(textOf(<WeekPerformanceTab detail={FULL} wording={QUARTER} />)).toContain('Which days carried the quarter.')
    cleanup()
    expect(textOf(<WeekMistakesTab table={computeMistakesTable(TRADES)} wording={QUARTER} />))
      .toContain("Aggregated across the quarter's trades.")
    cleanup()
    const perf = textOf(<WeekPerformanceTab detail={FULL} wording={QUARTER} />)
    expect(perf, 'a tab kept its own word for the streak').toContain('Streak into next quarter')
    expect(perf, 'the old word survived somewhere in this tab').not.toContain('week')
  })

  it('AE3 no tab carries the period noun in a string literal any more', () => {
    // ASSERTED ON THE SOURCE, BY BYTE, scoped to string literals and JSX text
    // — not on rendered output, which would pass the moment the host happened
    // to supply the right word.
    const FILES = [
      'WeekOverviewTab.tsx',
      'WeekPerformanceTab.tsx',
      'WeekTradesTab.tsx',
      'WeekMistakesTab.tsx',
      'WeekPatternsTab.tsx',
    ]
    const offenders: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(process.cwd(), 'src/components/calendar/WeekReviewModal', f), 'utf-8')
      src.split('\n').forEach((line, i) => {
        const s = line.trim()
        if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return
        if (s.startsWith('import ')) return
        // a quoted literal, or JSX text, carrying the noun
        const inLiteral = /'[^']*\bweeks?\b[^']*'|"[^"]*\bweeks?\b[^"]*"/i.test(s)
        const inJsxText = /^[^<>{}]*\bweeks?\b[^<>{}]*$/i.test(s) && !/^\w+[:(]/.test(s)
        if (inLiteral || inJsxText) offenders.push(`${f}:${i + 1}  ${s}`)
      })
    }
    expect(offenders, `hardcoded period wording remains:\n${offenders.join('\n')}`).toEqual([])
  })

  it('AE4 CONTROL: DetailNotesTab is untouched — it already did this', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/calendar/DetailNotesTab.tsx'), 'utf-8')
    expect(md5(src), 'the Notes tab moved, and it had nothing to move').toBe(
      '8a1c3f51df2de1fc5bb6f35c5412dc7d',
    )
  })

  it('AE5 the WEEK wording reproduces all sixteen strings exactly', () => {
    // AE1 restated from the host side. Both are kept so a failure says WHICH
    // side moved: the tab reading the wrong field, or the host supplying the
    // wrong word.
    expect(WEEK_WORDING).toEqual({
      reviewTitle: 'Weekly review',
      reviewDone: 'Logged for this week — weekly-review XP banked.',
      reviewPrompt: 'Mark this week reviewed to bank the weekly-review XP.',
      noTrades: 'No trades this week.',
      equitySubtitle: 'Cumulative net P&L across the week — steps at each trade close.',
      streakLabel: 'Streak into next week',
      profitFactorUndefined:
        'No losing trades — profit factor is undefined (winning-only week).',
      noPlaybooks: 'No playbooks tagged this week.',
      dayByDaySubtitle: 'Which days carried the week.',
      mistakesSubtitle: "Aggregated across the week's trades.",
      patternsTitle: 'Patterns this week',
      patternsEmpty:
        "No recurring topics yet — they'll appear as you journal this week.",
      patternsSubtitle:
        "Topics you wrote across this week's entries — counts, not judgments.",
    })
  })
})

// @vitest-environment jsdom
// v0.2.7 Feature 1, the missing half — T5 through T9.
//
// Three strings on this tab described a scope they no longer had. "The four numbers
// that matter" survived two features that took the count to twelve. The Daily
// breakdown promised a filter the previous commit moved out of it. The chart titles
// read "All time" while a symbol filter showed one ticker.
//
// T9 is the one that stops it happening again: nothing caught "four numbers" for two
// whole features, because nothing was looking.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewTab from '../OverviewTab'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const TRADES: TradeListRow[] = [
  makeTrade({
    id: 1, symbol: 'AAAA', date: '2026-08-10',
    open_time: '2026-08-10T13:30:00Z', close_time: '2026-08-10T14:00:00Z',
    net_pnl: 500, gross_pnl: 510, total_fees: 10,
  }),
  makeTrade({
    id: 2, symbol: 'BBBB', date: '2026-08-11',
    open_time: '2026-08-11T13:30:00Z', close_time: '2026-08-11T14:00:00Z',
    net_pnl: -200, gross_pnl: -190, total_fees: 10,
  }),
  makeTrade({
    id: 3, symbol: 'BBBB', date: '2026-08-12',
    open_time: '2026-08-12T13:30:00Z', close_time: '2026-08-12T14:00:00Z',
    net_pnl: -100, gross_pnl: -90, total_fees: 10,
  }),
]

const renderTab = () =>
  render(
    <MemoryRouter>
      <OverviewTab trades={TRADES} />
    </MemoryRouter>,
  )

const body = () => document.body.textContent ?? ''
const chartTitles = () =>
  Array.from(document.querySelectorAll('*'))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim() ?? '')
    .filter((t) => /^(Daily P&L|Cumulative P&L|Daily Volume|Win %) \(/.test(t))

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

beforeEach(() => document.body.replaceChildren())

// ── T8 ──────────────────────────────────────────────────────────────────────
describe('T8 with no filter active, every label reads as it does today', () => {
  it('the four chart titles still say All time', () => {
    renderTab()
    const titles = chartTitles()
    expect(titles).toHaveLength(4)
    for (const t of titles) expect(t).toMatch(/\(All time\)$/)
  })

  it('the count line says the whole book is in view', () => {
    renderTab()
    expect(body()).toContain('3 of 3 round trips · All time')
  })
})

// ── T5 ──────────────────────────────────────────────────────────────────────
describe('T5 with a 7D range active, no visible label reads "all time"', () => {
  it('nothing anywhere on the tab claims all time', () => {
    renderTab()
    expect(body()).toMatch(/all time/i) // present before, so the assertion below bites
    fireEvent.click(screen.getByText('7D'))
    expect(body()).not.toMatch(/all time/i)
  })
})

// ── T7 ──────────────────────────────────────────────────────────────────────
describe('T7 chart titles reflect the active range', () => {
  it('7D retitles every chart', () => {
    renderTab()
    fireEvent.click(screen.getByText('7D'))
    const titles = chartTitles()
    expect(titles).toHaveLength(4)
    for (const t of titles) expect(t).toMatch(/\(7 days\)$/)
  })

  it('YTD retitles every chart', () => {
    renderTab()
    fireEvent.click(screen.getByText('YTD'))
    for (const t of chartTitles()) expect(t).toMatch(/\(YTD\)$/)
  })

  it('a symbol filter stops the titles claiming the whole range', () => {
    // The date scope is still all time, but the population is one ticker. Naming
    // the range here is the same overclaim T5 forbids, in another dimension.
    renderTab()
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    for (const t of chartTitles()) {
      expect(t).toMatch(/\(Filtered\)$/)
      expect(t).not.toMatch(/all time/i)
    }
  })

  it('a real range survives beside the narrowing', () => {
    renderTab()
    fireEvent.click(screen.getByText('YTD'))
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    for (const t of chartTitles()) expect(t).toMatch(/\(YTD, filtered\)$/)
  })
})

// ── T6 ──────────────────────────────────────────────────────────────────────
describe('T6 the round-trip count reflects the FILTERED count, not the book', () => {
  it('narrowing to one ticker moves the count', () => {
    renderTab()
    expect(body()).toContain('3 of 3 round trips')
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(body()).toContain('1 of 3 round trip ·')
    expect(body()).not.toContain('3 of 3 round trips')
  })

  it('a filter that matches nothing says zero rather than going quiet', () => {
    renderTab()
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'ZZZZ' } })
    expect(body()).toContain('0 of 3 round trips')
  })
})

// ── T9 ──────────────────────────────────────────────────────────────────────
describe('T9 NO STALE COUNTS', () => {
  /** Files whose section descriptions narrate what a section contains. */
  const FILES = [
    'src/components/analytics/tabs/OverviewTab.tsx',
    'src/components/analytics/OverviewTiles.tsx',
    'src/components/analytics/AnalyticsFilterBar.tsx',
    'src/components/reports/overview/NormalCharts.tsx',
  ]

  /** A count of WIDGETS — the class of claim that goes stale when a section grows.
   *  Deliberately narrow: "Top 5 by net P&L" is a real cap and "9 EMA" is a domain
   *  term, and a guard that flagged those would be turned off within a week. */
  const NUMBER =
    '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)'
  const WIDGET =
    '(?:numbers?|tiles?|cards?|charts?|metrics?|widgets?|columns?|rows?|panels?|sections?|stats?|kpis?|figures?)'
  const STALE = new RegExp(`\\b${NUMBER}\\s+${WIDGET}\\b`, 'i')

  it('no description or subtitle string hardcodes how many widgets it has', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      const text = src(f)
      for (const m of text.matchAll(/(?:description|subtitle)="([^"]*)"/g)) {
        if (STALE.test(m[1])) offenders.push(`${f}: "${m[1]}"`)
      }
    }
    expect(
      offenders,
      'a description that counts its own widgets goes stale the next time the ' +
        'section grows, and nothing will notice:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('the guard actually matches the string that went stale', () => {
    // Without this, a typo in the pattern would make the test above pass forever.
    expect(STALE.test('equity curve, the four numbers that matter, and your bookends')).toBe(true)
    expect(STALE.test('twelve tiles across the top')).toBe(true)
    expect(STALE.test('3 charts')).toBe(true)
    // ...and leaves the legitimate ones alone.
    expect(STALE.test('Top 5 by net P&L.')).toBe(false)
    expect(STALE.test('Where was price relative to 9 EMA when you entered?')).toBe(false)
    expect(STALE.test('Trade-day volume vs 30-day average.')).toBe(false)
    expect(STALE.test('Two periods, side by side.')).toBe(false)
  })

  it('the Daily breakdown no longer promises a filter it does not contain', () => {
    const tab = src('src/components/analytics/tabs/OverviewTab.tsx')
    const m = tab.match(/title="Daily breakdown"\s*\n\s*description="([^"]*)"/)
    expect(m, 'Daily breakdown description not found').toBeTruthy()
    expect((m as RegExpMatchArray)[1]).not.toMatch(/filter/i)
  })
})

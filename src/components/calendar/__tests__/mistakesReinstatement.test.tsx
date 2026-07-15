// @vitest-environment jsdom
//
// MISTAKES DISPLAYS REINSTATEMENT (djsevans87 ticket #7). Reverses the DISPLAY
// half of 2f51c52 ("remove mistake displays from the calendar"); the store
// consolidation (e45a43e) stays. Three surfaces:
//   1. Day Detail — separate read-only Mistakes tab (6th tab), from the
//      surviving DayMetrics.mistakeTagCounts (day.ts:224, junction-fed).
//   2. Week Review — WeekMistakesTab restored BESIDE Patterns (which stays).
//   3. WeeklyPanel — the top-mistake chip, REBUILT ON THE JUNCTION
//      (trade_mistake → mistake_def), never the orphaned legacy JSON column
//      (test 5 bans its name from the weekly compute).
import { render, cleanup } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { WeeklySummary } from '@shared/calendar-types'
import MistakesTab from '../DayDetailModal/MistakesTab'
import WeekMistakesTab from '../WeekReviewModal/WeekMistakesTab'
import WeeklyPanel from '../WeeklyPanel'
import { topMistake } from '@/core/calendar/topMistake'

afterEach(() => cleanup())

const COUNTS = [
  { tag: 'FOMO - chased a runner', count: 3 },
  { tag: 'Averaged down', count: 1 },
]

function weekSummary(over: Partial<WeeklySummary>): WeeklySummary {
  return {
    week_start: '2026-05-03',
    week_end: '2026-05-09',
    in_month: true,
    trade_count: 12,
    net_pnl: 350,
    gross_pnl: 380,
    total_fees: 30,
    winners: 7,
    losers: 5,
    win_rate: 7 / 12,
    profit_factor: 2.1,
    avg_winner: 90,
    avg_loser: -45,
    best_day: { date: '2026-05-04', net_pnl: 300 },
    worst_day: { date: '2026-05-06', net_pnl: -120 },
    best_symbol: { symbol: 'VRAX', net_pnl: 280 },
    days_traded: 4,
    days_journaled: 3,
    emotion_avg: 3.5,
    streak: { kind: 'win', days: 3 },
    notes: '',
    top_mistake: null,
    ...over,
  }
}

describe('(1) Day Detail Mistakes tab — read-only rollup from DayMetrics.mistakeTagCounts', () => {
  it('renders each tag with its ×count', () => {
    const { container } = render(<MistakesTab mistakeTagCounts={COUNTS} />)
    const text = container.textContent!
    expect(text).toContain('FOMO - chased a runner')
    expect(text).toContain('×3')
    expect(text).toContain('Averaged down')
    expect(text).toContain('×1')
  })

  it('empty → the honest empty state, not a blank', () => {
    const { container } = render(<MistakesTab mistakeTagCounts={[]} />)
    expect(container.textContent).toContain('No mistakes tagged on any trade today.')
  })
})

describe('(2) Week Review Mistakes tab — same rollup from WeekMetrics', () => {
  it('renders each tag with its ×count', () => {
    const { container } = render(<WeekMistakesTab mistakeTagCounts={COUNTS} />)
    expect(container.textContent).toContain('FOMO - chased a runner')
    expect(container.textContent).toContain('×3')
  })

  it('empty → the honest empty state', () => {
    const { container } = render(<WeekMistakesTab mistakeTagCounts={[]} />)
    expect(container.textContent).toContain('No mistakes tagged on any trade this week.')
  })
})

describe('(3) the junction-rebuilt top-mistake fold', () => {
  it('counts occurrences and returns the top name + count', () => {
    const out = topMistake([
      { name: 'FOMO - chased a runner', sort_position: 2 },
      { name: 'Averaged down', sort_position: 1 },
      { name: 'FOMO - chased a runner', sort_position: 2 },
      { name: 'FOMO - chased a runner', sort_position: 2 },
    ])
    expect(out).toEqual({ name: 'FOMO - chased a runner', count: 3 })
  })

  it('TIE-BREAK (deliberate improvement over the deleted first-seen-wins): count desc, then sort_position asc, then name', () => {
    // The deleted compute used strict `>` over Map insertion order — the winner
    // depended on trade/tag encounter order. The rebuild is deterministic.
    const out = topMistake([
      { name: 'Zebra mistake', sort_position: 5 },
      { name: 'Averaged down', sort_position: 1 },
      { name: 'Zebra mistake', sort_position: 5 },
      { name: 'Averaged down', sort_position: 1 },
    ])
    expect(out).toEqual({ name: 'Averaged down', count: 2 })
    // Same sort_position → name breaks the tie.
    const sameSort = topMistake([
      { name: 'B mistake', sort_position: 1 },
      { name: 'A mistake', sort_position: 1 },
    ])
    expect(sameSort).toEqual({ name: 'A mistake', count: 1 })
  })

  it('a zero-mistakes week → null (no chip)', () => {
    expect(topMistake([])).toBeNull()
  })
})

describe('(4) the WeeklyPanel chip', () => {
  it('renders "name" with the ×count tooltip in the supporting tier', () => {
    const { container } = render(
      <WeeklyPanel
        summary={weekSummary({ top_mistake: { name: 'FOMO - chased a runner', count: 4 } })}
        onClick={() => {}}
      />,
    )
    expect(container.textContent).toContain('FOMO - chased a runner')
    expect(container.querySelector('[title="Top mistake: FOMO - chased a runner (4×)"]')).not.toBeNull()
  })

  it('absent when top_mistake is null', () => {
    const { container } = render(
      <WeeklyPanel summary={weekSummary({ top_mistake: null })} onClick={() => {}} />,
    )
    expect(container.textContent).not.toContain('Top mistake')
    expect(container.querySelector('[title^="Top mistake"]')).toBeNull()
  })
})

describe('(5)(6) structural pins', () => {
  const src = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  it('(5) the weekly compute never touches the orphaned mistakes_json column (code lines, comments stripped)', () => {
    // Split on \r?\n: the repo checks out CRLF, and a trailing \r defeats
    // `//.*$` (JS `.` never matches \r), leaving comments un-stripped.
    const weekly = src('../../../../electron/calendar/weekly.ts')
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(weekly).not.toMatch(/mistakes_json/)
  })

  it('(6) Patterns keeps its slot — the week modal wires BOTH patterns and mistakes', () => {
    const index = src('../WeekReviewModal/index.tsx')
    expect(index).toMatch(/key: 'patterns'/)
    expect(index).toMatch(/WeekPatternsTab/)
    expect(index).toMatch(/key: 'mistakes'/)
    expect(index).toMatch(/WeekMistakesTab/)
  })
})

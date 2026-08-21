// v0.2.7 Feature 5 — T7, NO DEAD ENGINE. The guard that would have caught both.
//
// It has now happened twice. Feature 4 built the range engine, wired it into the
// filter and tested it thoroughly; nothing populated TradesFilterState.ranges, so
// a working, fully tested filter could not be used by anyone. Feature 5's commit
// before this one built the calendar compositor, tested it with twenty-eight
// assertions across both books, and gave it no caller. Both times the suite was
// green and the feature did not exist.
//
// Same remedy as T30, and deliberately the same shape: assert the chain at the
// source level, in both directions, so neither half can drift alone. Every export
// mode the compositor implements must be offered by the share control, every mode
// the control offers must be one the compositor implements, and the control
// itself must be reachable from the page.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CALENDAR_CARD_UNITS, dayCellText } from '@/lib/calendarCard'
import { buildMonthCardData, cardFileName } from '../monthCardData'
import type { ContributedCapital } from '@/lib/useContributedCapital'

const ANCHORED: ContributedCapital = {
  contributed: 10_000, reason: 'ok', anchored: 1, total: 1,
}

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const CONTROL = src('src/components/calendar/CalendarShareControl.tsx')
const HEADER = src('src/components/calendar/CalendarHeader.tsx')
const PAGE = src('src/pages/Calendar.tsx')
const CARD = src('src/lib/calendarCard.ts')

describe('T7 NO DEAD ENGINE — every export mode is reachable from the UI', () => {
  it('every mode the compositor implements is OFFERED by the share control', () => {
    // The control maps the exported list rather than restating it, which is the
    // structural half of the guarantee; this is the assertion that keeps it so.
    expect(CONTROL).toContain('CALENDAR_CARD_UNITS.map')
    for (const u of CALENDAR_CARD_UNITS) {
      expect(
        CONTROL.includes(`'${u}'`) || CONTROL.includes(`${u}:`),
        `the control never mentions the '${u}' mode`,
      ).toBe(true)
    }
  })

  it('every mode the control can produce is one the compositor DRAWS', () => {
    // dayCellText is the single place a unit turns into text. A mode it does not
    // handle would fall through to the percentage branch silently.
    for (const u of CALENDAR_CARD_UNITS) {
      const drawn = dayCellText({ pnl: 12.5, pct: 0.13 }, u, false)
      expect(drawn, `'${u}' drew nothing`).toBeTruthy()
      expect(drawn).not.toBe('—')
    }
    // and the two modes are actually DIFFERENT — a control offering two buttons
    // that produce identical cards is a dead engine wearing a second hat.
    const rendered = CALENDAR_CARD_UNITS.map((u) => dayCellText({ pnl: 12.5, pct: 0.13 }, u, false))
    expect(new Set(rendered).size).toBe(CALENDAR_CARD_UNITS.length)
  })

  it('the label map covers every offered mode', () => {
    for (const u of CALENDAR_CARD_UNITS) {
      expect(CONTROL, `'${u}' has no button label`).toMatch(
        new RegExp(`${u}:\\s*'[^']+'`),
      )
    }
  })

  it('the control actually CALLS the compositor and the save channel', () => {
    expect(CONTROL).toContain('composeCalendarCard(')
    expect(CONTROL).toContain('ipc.chartSaveScreenshot(')
    // and it builds its input from the month it was handed — no year/month
    // literal, no clock.
    expect(CONTROL).toContain('buildMonthCardData(month,')
    expect(CONTROL).not.toMatch(/new Date\(/)
  })

  it('and the chain reaches the page: page -> header -> control', () => {
    expect(HEADER).toContain('<CalendarShareControl month={month} />')
    expect(PAGE).toContain('<CalendarHeader')
    expect(PAGE).toContain('month={data}')
  })

  it('NO SECOND SAVE IDIOM — the existing dialog path is the only one', () => {
    // saveChartScreenshot is generic PNG-save-with-dialog; a second channel, a
    // clipboard write or a synthetic <a download> would each be a new failure
    // surface for the same job.
    expect(CONTROL).not.toMatch(/navigator\.clipboard/)
    expect(CONTROL).not.toMatch(/createElement\('a'\)/)
    expect(CONTROL).not.toMatch(/URL\.createObjectURL/)
    const ipcCalls = Array.from(CONTROL.matchAll(/ipc\.([A-Za-z]+)\(/g)).map((mm) => mm[1])
    expect(ipcCalls).toEqual(['chartSaveScreenshot'])
  })

  it('the compositor exports the list the guard and the UI both read', () => {
    // If this list stops being exported, the control falls back to hand-written
    // buttons and the guard above goes quietly vacuous.
    expect(CARD).toContain('export const CALENDAR_CARD_UNITS')
    expect(CARD).toContain('typeof CALENDAR_CARD_UNITS)[number]')
  })

  it('and the mapping the control calls actually produces a card for each mode', () => {
    const month = {
      stats: {
        year: 2026, month: 7, net_pnl: 1.0, gross_pnl: 1.0, total_fees: 0,
        trade_count: 1, winners: 1, losers: 0, trading_days: 1,
      },
      days: [
        {
          date: '2026-07-31', net_pnl: 1.0, gross_pnl: 1.0, total_fees: 0,
          trade_count: 1, winners: 1, losers: 0, avg_winner: null, avg_loser: null,
          day_tags: [], has_journal: false, no_trade_day: false, is_holiday: false,
          sentiment: null,
        },
      ],
      range: { earliest: null, latest: null, monthsWithTrades: [] },
      weeks: [],
    }
    for (const u of CALENDAR_CARD_UNITS) {
      const data = buildMonthCardData(month, u, ANCHORED)
      expect(data.unit, `'${u}' did not survive the mapping`).toBe(u)
      expect(data.monthLabel).toBe('July 2026')
      expect(data.days).toHaveLength(1)
    }
    expect(cardFileName(2026, 7, 'wide')).toBe('fugaedge-calendar-2026-07-wide.png')
  })
})

// Multi-account slice — Calendar reads become scope-aware (the
// dashboard-scope.test.ts mirror). SQL-contract via a routing shim: every
// TRADES read (month day-cells, year roll-up, range/nav bounds, weekly trades
// + the weekly streak's daily-P&L map) carries the scope through the ONE seam
// (single -> account_id = ?; 'all' -> the non-sim wall). Day-level journal /
// session_meta / week_notes metadata has NO account column — those reads stay
// GLOBAL by nature, pinned here so a future "scope everything" sweep can't
// silently break tags/sentiment/holiday marks.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

interface Captured {
  sql: string
  args: unknown[]
}

let gets: Captured[] = []
let alls: Captured[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/MIN\(date\) AS earliest/i.test(sql)) return { earliest: null, latest: null }
        return undefined
      },
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getCalendarMonth, getCalendarYear } from '../get'
import { listTradesForWeek } from '../weekly'

beforeEach(() => {
  gets = []
  alls = []
})

const all = () => [...gets, ...alls]
const tradeReads = () => all().filter((c) => /FROM trades/i.test(c.sql))
// STANDALONE metadata reads only — the month mega-query joins journal +
// session_meta alongside its trades CTE, so it legitimately carries the
// scope; the pin targets the pure-metadata statements (weekly journals,
// week_notes).
const journalReads = () =>
  all().filter(
    (c) =>
      /FROM journal|FROM session_meta|FROM week_notes/i.test(c.sql) &&
      !/FROM trades/i.test(c.sql),
  )

describe("calendar reads — 'all' scope (the default when absent)", () => {
  it('every trades read carries the sim wall; day-metadata reads stay GLOBAL', () => {
    getCalendarMonth(2026, 6)
    const reads = tradeReads()
    // month day-cells CTE, range bounds, months-with-trades, weekly trades,
    // weekly daily-P&L map — at least these five.
    expect(reads.length).toBeGreaterThanOrEqual(5)
    for (const r of reads) {
      expect(r.sql).toContain(SIM_WALL)
    }
    // journal / session_meta / week_notes have no account dimension — pinned.
    const meta = journalReads()
    expect(meta.length).toBeGreaterThanOrEqual(2)
    for (const m of meta) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })

  it('the year roll-up carries the wall too', () => {
    getCalendarYear(2026)
    for (const r of tradeReads()) {
      expect(r.sql).toContain(SIM_WALL)
    }
  })
})

describe('calendar reads — single-account scope', () => {
  it('month: every trades read filters account_id = ? and binds the id', () => {
    getCalendarMonth(2026, 6, { accountId: 'ACCT-X' })
    const reads = tradeReads()
    expect(reads.length).toBeGreaterThanOrEqual(5)
    for (const r of reads) {
      expect(r.sql).toMatch(/account_id = \?/)
      expect(r.args).toContain('ACCT-X')
    }
  })

  it('year: the roll-up filters and binds', () => {
    getCalendarYear(2026, { accountId: 'ACCT-X' })
    for (const r of tradeReads()) {
      expect(r.sql).toMatch(/account_id = \?/)
      expect(r.args).toContain('ACCT-X')
    }
  })

  it('listTradesForWeek threads the scope', () => {
    listTradesForWeek('2026-06-01', { accountId: 'ACCT-X' })
    const r = tradeReads()[0]
    expect(r.sql).toMatch(/account_id = \?/)
    expect(r.args).toContain('ACCT-X')
  })

  it('day-cell math regression guard: the month CTE keeps its epsilon predicates + deleted_at filter', () => {
    getCalendarMonth(2026, 6, { accountId: 'ACCT-X' })
    const cte = tradeReads().find((r) => /WITH tr AS/i.test(r.sql))!
    expect(cte).toBeTruthy()
    expect(cte.sql).toMatch(/CASE WHEN net_pnl > \? THEN 1 ELSE 0 END/)
    expect(cte.sql).toMatch(/CASE WHEN net_pnl < \? THEN 1 ELSE 0 END/)
    expect(cte.sql).toMatch(/deleted_at IS NULL/i)
    expect(cte.sql).toMatch(/GROUP BY date/i)
  })
})

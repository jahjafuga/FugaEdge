// Multi-account (Technicals slice, beat 2) — getWeekDetail joins the seam:
// the trades read threads accountScope through listTradesInRange ->
// listTrades, and the week streak map (the green/red-day P&L streak — NOT
// the showing-up identity streak) gains the seam clause, healing the
// split-brain where the trades rode the wall while the map was
// legacy-unfiltered. Routing-shim style (the 4a545f3 mirror): the fake db
// routes the streak-map read BY THE SQL THE SEAM GENERATES with a POISONED
// SIM DAY (-999 on the streak's anchor date) so a missing clause flips the
// streak sign and breaks the assertions. Week metadata (week_notes, journal)
// stays GLOBAL — pinned.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let alls: { sql: string; args: unknown[] }[] = []
let gets: { sql: string; args: unknown[] }[] = []

// Streak-map day rows per account. Wall = A+B summed; the poison flips the
// most-recent day's sign on the legacy route.
const MAP_A = [
  { date: '2026-06-12', pnl: 100 },
  { date: '2026-06-11', pnl: 50 },
]
const MAP_B = [{ date: '2026-06-12', pnl: -20 }]
const MAP_WALL = [
  { date: '2026-06-12', pnl: 80 },
  { date: '2026-06-11', pnl: 50 },
]
const MAP_LEGACY_POISONED = [
  { date: '2026-06-12', pnl: -919 }, // 80 + the sim day's -999
  { date: '2026-06-11', pnl: 50 },
]

function routeStreakMap(sql: string, args: unknown[]): unknown[] {
  if (/account_id = \?/.test(sql)) {
    const acct = args[args.length - 1] as string
    if (acct === 'ACCT-A') return MAP_A
    if (acct === 'ACCT-B') return MAP_B
    return []
  }
  if (sql.includes(SIM_WALL)) return MAP_WALL
  return MAP_LEGACY_POISONED
}

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/SUM\(net_pnl\)/i.test(sql)) return routeStreakMap(sql, args)
        return [] // the trades list + journal range reads
      },
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        return undefined // week_notes
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getWeekDetail } from '../repo'

beforeEach(() => {
  alls = []
  gets = []
})

const WEEK = '2026-06-07' // Sun; weekEnd 2026-06-13

const streakMapReads = () => alls.filter((c) => /SUM\(net_pnl\)/i.test(c.sql))
const tradesListReads = () =>
  alls.filter((c) => /FROM trades t/i.test(c.sql) && !/SUM\(net_pnl\)/i.test(c.sql))
const metadataReads = () => [
  ...alls.filter((c) => /FROM journal/i.test(c.sql)),
  ...gets.filter((c) => /FROM week_notes/i.test(c.sql)),
]

describe('getWeekDetail — the streak map through the seam', () => {
  it("single scope: the map is that account's daily sums only (streak tells that account's story)", () => {
    const a = getWeekDetail(WEEK, { accountScope: { accountId: 'ACCT-A' } })
    const mapRead = streakMapReads()[0]
    expect(mapRead.sql).toMatch(/account_id = \?/)
    expect(mapRead.args).toContain('ACCT-A')
    expect(a.metrics.streak).toEqual({ kind: 'win', days: 2 })

    alls = []
    const b = getWeekDetail(WEEK, { accountScope: { accountId: 'ACCT-B' } })
    expect(b.metrics.streak).toEqual({ kind: 'loss', days: 1 })
  })

  it("'all': the wall in the map SQL; the poisoned sim day never enters any sum", () => {
    const d = getWeekDetail(WEEK, { accountScope: 'all' })
    expect(streakMapReads()[0].sql).toContain(SIM_WALL)
    // 80 on the anchor day, not -919: the poison stayed out.
    expect(d.metrics.streak).toEqual({ kind: 'win', days: 2 })
  })

  it("absent scope: byte-equal to explicit 'all', wall in the map SQL", () => {
    const absent = getWeekDetail(WEEK)
    expect(streakMapReads()[0].sql).toContain(SIM_WALL)
    alls = []
    gets = []
    const explicit = getWeekDetail(WEEK, { accountScope: 'all' })
    expect(absent).toEqual(explicit)
  })

  it('threading: the week trades read carries the scope through listTradesInRange -> listTrades', () => {
    getWeekDetail(WEEK, { accountScope: { accountId: 'ACCT-A' } })
    const list = tradesListReads()[0]
    expect(list.sql).toMatch(/account_id = \?/)
    expect(list.args).toContain('ACCT-A')

    alls = []
    getWeekDetail(WEEK, { accountScope: 'all' })
    expect(tradesListReads()[0].sql).toContain(SIM_WALL)
  })

  it('metadata GLOBAL: week_notes and journal reads carry NO account dimension under every scope', () => {
    getWeekDetail(WEEK, { accountScope: { accountId: 'ACCT-A' } })
    getWeekDetail(WEEK, { accountScope: 'all' })
    const meta = metadataReads()
    expect(meta.length).toBeGreaterThanOrEqual(4)
    for (const m of meta) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })

  // Precision pass Beat F4 carve-out: the week's green/red-day P&L STREAK is a
  // sign classification (like green-days), not a headline money total — F4
  // leaves it on the 2dp net_pnl so a sub-cent tail never flips a day's colour.
  it('carve-out (F4): the streak map stays SUM(net_pnl) (2dp), never net_pnl_precise', () => {
    getWeekDetail(WEEK, { accountScope: 'all' })
    const map = streakMapReads()[0]
    expect(map).toBeTruthy()
    expect(map.sql).not.toMatch(/net_pnl_precise/i)
  })
})

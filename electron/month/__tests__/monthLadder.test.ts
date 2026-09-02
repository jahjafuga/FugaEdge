// THE ROWS SUM TO THE MONTH, ASSERTED AGAINST THE FUNCTION.
//
// AL1..AL3 compare the ladder's totals to getPeriodDetail over the month --
// never to a literal, because a literal only pins the demo book on the day it
// was written and says nothing about the arithmetic.
//
// The mock-db shape is periodDetail.test.ts's, extended with a per-window
// trades list so the rows have something to add up. Each fake trade carries a
// date, so a window that reached too far or not far enough shows immediately.
import { describe, expect, it, beforeEach, vi } from 'vitest'

let alls: { sql: string; args: unknown[] }[] = []

/** Two trades on each of four days, spread so that EVERY June week row gets
 *  some and the straddling ends get theirs from inside the month only.
 *  2026-05-31 and 2026-07-01 sit OUTSIDE June: a ladder built on full weeks
 *  instead of clipped ones would pick them up and overshoot. */
const TRADES = [
  { date: '2026-05-31', net_pnl: 999 }, // outside June, in the first grid week
  { date: '2026-06-03', net_pnl: 100 },
  { date: '2026-06-09', net_pnl: -40 },
  { date: '2026-06-17', net_pnl: 60 },
  { date: '2026-06-24', net_pnl: -10 },
  { date: '2026-06-29', net_pnl: 25 },
  { date: '2026-07-01', net_pnl: 777 }, // outside June, in the last grid week
]

const row = (t: { date: string; net_pnl: number }, i: number) => ({
  id: i + 1,
  date: t.date,
  symbol: 'AAA',
  side: 'long',
  open_time: `${t.date}T14:30:00.000Z`,
  close_time: `${t.date}T15:00:00.000Z`,
  is_open: 0,
  shares_bought: 100,
  avg_buy_price: 10,
  shares_sold: 100,
  avg_sell_price: 11,
  gross_pnl: t.net_pnl,
  total_fees: 0,
  commission: 0,
  net_pnl: t.net_pnl,
  executions_json: null,
  source_format: 'das',
  deleted_at: null,
  account_id: 'A',
  mistake_tags_json: null,
})

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/SUM\(net_pnl\)/i.test(sql)) {
          const byDate = new Map<string, number>()
          for (const t of TRADES) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.net_pnl)
          return [...byDate].map(([date, pnl]) => ({ date, pnl }))
        }
        if (/FROM journal/i.test(sql)) return []
        // the trades list: bounded by the window it was handed
        const [from, to] = args as string[]
        return TRADES.filter((t) => t.date >= from && t.date <= to).map(row)
      },
      get: (...args: unknown[]) => {
        alls.push({ sql, args })
        return undefined
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getMonthDetail } from '../repo'
import { getPeriodDetail } from '../../week/repo'

beforeEach(() => {
  alls = []
})

describe('AL the ladder sums into the month', () => {
  it('AL1 the rows trade counts sum to the month, asserted against getPeriodDetail', () => {
    const month = getMonthDetail('2026-06')
    const want = getPeriodDetail('2026-06-01', '2026-06-30')
    const sum = month.ladder.reduce((a, r) => a + r.tradeCount, 0)
    expect(sum, 'the rows do not sum to the month').toBe(want.trades.length)
    expect(sum, 'the fixture has nothing in June').toBeGreaterThan(0)
    // and the OUT-of-month trades are excluded: 999 and 777 must not appear
    expect(month.trades.some((t) => t.date === '2026-05-31')).toBe(false)
    expect(month.trades.some((t) => t.date === '2026-07-01')).toBe(false)
  })

  it('AL2 the rows nets sum to the month net', () => {
    const month = getMonthDetail('2026-06')
    const want = getPeriodDetail('2026-06-01', '2026-06-30')
    const sum = month.ladder.reduce((a, r) => a + r.netPnl, 0)
    expect(Math.abs(sum - want.metrics.netPnl), `rows ${sum} vs month ${want.metrics.netPnl}`)
      .toBeLessThan(1e-9)
    // a full-week ladder would have swept in 999 + 777
    expect(sum, 'an out-of-month trade landed in the rows').toBeLessThan(900)
  })

  it('AL3 the rows trading days sum to the month trading days', () => {
    const month = getMonthDetail('2026-06')
    const want = getPeriodDetail('2026-06-01', '2026-06-30')
    const sum = month.ladder.reduce((a, r) => a + r.tradingDays, 0)
    expect(sum, 'the rows do not sum to the month').toBe(want.metrics.tradingDays)
    expect(sum).toBeGreaterThan(0)
  })

  it('AL3b every row IS getPeriodDetail on its own clipped window', () => {
    const month = getMonthDetail('2026-06')
    for (const r of month.ladder) {
      const p = getPeriodDetail(r.from, r.to)
      expect(r.tradeCount, `${r.from}..${r.to} trade count`).toBe(p.trades.length)
      expect(r.netPnl, `${r.from}..${r.to} net`).toBe(p.metrics.netPnl)
      expect(r.tradingDays, `${r.from}..${r.to} trading days`).toBe(p.metrics.tradingDays)
      expect(r.winRate, `${r.from}..${r.to} win rate`).toBe(p.metrics.winRate)
    }
  })

  it('AL4 the month TOPLINE is the window function too, not just the rows', () => {
    // FOUND BY PLANT AN3, WHICH REDDENED NOTHING. AL1..AL3 compare the row
    // sums against a FRESH getPeriodDetail call -- so a getMonthDetail that
    // corrupted its own metrics while computing the rows correctly passed
    // every case in this file. That is the exact failure the ladder exists to
    // make impossible: rows that add up perfectly to a topline nobody checked,
    // beside a header showing something else.
    const month = getMonthDetail('2026-06')
    const want = getPeriodDetail('2026-06-01', '2026-06-30')
    expect(month.metrics).toEqual(want.metrics)
    expect(month.trades).toEqual(want.trades)
    // and the rows agree with THAT topline, not merely with each other
    expect(month.ladder.reduce((a, r) => a + r.tradeCount, 0)).toBe(month.metrics.tradeCount)
    expect(month.ladder.reduce((a, r) => a + r.tradingDays, 0)).toBe(month.metrics.tradingDays)
    expect(Math.abs(month.ladder.reduce((a, r) => a + r.netPnl, 0) - month.metrics.netPnl))
      .toBeLessThan(1e-9)
    expect(month.metrics.tradeCount, 'the fixture has nothing in June').toBeGreaterThan(0)
  })

  it('AL3c each row carries the FULL week it opens, and the clip it summed', () => {
    const month = getMonthDetail('2026-06')
    expect(month.ladder.map((r) => [r.from, r.to, r.weekStart, r.weekEnd])).toEqual([
      ['2026-06-01', '2026-06-06', '2026-05-31', '2026-06-06'],
      ['2026-06-07', '2026-06-13', '2026-06-07', '2026-06-13'],
      ['2026-06-14', '2026-06-20', '2026-06-14', '2026-06-20'],
      ['2026-06-21', '2026-06-27', '2026-06-21', '2026-06-27'],
      ['2026-06-28', '2026-06-30', '2026-06-28', '2026-07-04'],
    ])
  })
})

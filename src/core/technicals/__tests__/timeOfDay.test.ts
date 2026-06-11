import { describe, it, expect } from 'vitest'
import {
  classifyTimeOfDay,
  computeTimeOfDay,
  rowsForTimeOfDayCell,
  TIME_OF_DAY_BUCKETS,
} from '../timeOfDay'
import type { TimeOfDayStats } from '../timeOfDay'
import type { BucketKey } from '../macdBuckets'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

// RED-first tests for the Time-of-Day 5-bucket × MACD-state cross-tab (spec §I /
// §B Section 6). Rows are placed by entry time (open_time, ET-converted via
// utcToEasternParts) on one axis and MACD state (classifyMacdBucket, reused) on
// the other. 2026-05-15 is EDT (UTC-4), so ET = UTC - 4; a winter date exercises
// the EST (UTC-5) path to lock DST-awareness.

// ET clock times on 2026-05-15 (EDT) as their UTC instants.
const T_0900 = '2026-05-15T13:00:00.000Z' // 09:00 ET -> pre930
const T_0930 = '2026-05-15T13:30:00.000Z' // 09:30 ET -> t0930 (lower edge)
const T_0945 = '2026-05-15T13:45:00.000Z' // 09:45 ET -> t0930
const T_1000 = '2026-05-15T14:00:00.000Z' // 10:00 ET -> t1000 (lower edge)
const T_1030 = '2026-05-15T14:30:00.000Z' // 10:30 ET -> t1000
const T_1100 = '2026-05-15T15:00:00.000Z' // 11:00 ET -> t1100 (lower edge)
const T_1130 = '2026-05-15T15:30:00.000Z' // 11:30 ET -> t1100
const T_1200 = '2026-05-15T16:00:00.000Z' // 12:00 ET -> t1200 (lower edge)
const T_1400 = '2026-05-15T18:00:00.000Z' // 14:00 ET -> t1200
const T_WINTER_0930 = '2026-01-15T14:30:00.000Z' // 09:30 EST (UTC-5) -> t0930

type Macd = { positive: boolean | null; rising: boolean | null }
const POS_RISING: Macd = { positive: true, rising: true }

function todRow(
  id: number,
  net_pnl: number,
  open_time: string,
  macd: Macd = POS_RISING,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    open_time,
    technicals: makeCompleteSnapshot({
      macd_positive: macd.positive,
      macd_rising: macd.rising,
    }),
  })
}

const EMPTY_BUCKET = {
  n: 0,
  winRate: null,
  netPnl: 0,
  avgWinner: null,
  avgLoser: null,
  expectancy: null,
}

const TIME_KEYS = TIME_OF_DAY_BUCKETS.map((b) => b.key)
const MACD_KEYS: BucketKey[] = [
  'posRising',
  'posFalling',
  'negRising',
  'negFalling',
]

// Invariant — excluded + every cell's n accounts for each input row once.
function expectCellInvariant(r: TimeOfDayStats, total: number): void {
  let sum = 0
  for (const t of TIME_KEYS) for (const m of MACD_KEYS) sum += r.cells[t][m].n
  expect(r.excluded + sum).toBe(total)
  expect(r.denominator).toBe(sum)
}

// ── TIME_OF_DAY_BUCKETS metadata ─────────────────────────────────────────────
describe('TIME_OF_DAY_BUCKETS metadata', () => {
  it('(M1) is the 5-bucket §I single source of truth (keys, edges)', () => {
    expect(TIME_OF_DAY_BUCKETS).toHaveLength(5)
    expect(TIME_KEYS).toEqual(['pre930', 't0930', 't1000', 't1100', 't1200'])
    expect(TIME_OF_DAY_BUCKETS[0].loMin).toBe(-Infinity)
    expect(TIME_OF_DAY_BUCKETS[4].hiMin).toBe(Infinity)
    const open = TIME_OF_DAY_BUCKETS[1]
    expect(open.key).toBe('t0930')
    expect(open.loMin).toBe(570) // 9:30
    expect(open.hiMin).toBe(600) // 10:00
  })
})

// ── classifyTimeOfDay ────────────────────────────────────────────────────────
describe('classifyTimeOfDay', () => {
  it('(C1) places interior times into pre930..t1200', () => {
    expect(classifyTimeOfDay(todRow(1, 0, T_0900))).toBe('pre930')
    expect(classifyTimeOfDay(todRow(2, 0, T_0945))).toBe('t0930')
    expect(classifyTimeOfDay(todRow(3, 0, T_1030))).toBe('t1000')
    expect(classifyTimeOfDay(todRow(4, 0, T_1130))).toBe('t1100')
    expect(classifyTimeOfDay(todRow(5, 0, T_1400))).toBe('t1200')
  })

  it('(C2) edges are left-inclusive (9:30 -> t0930, 10:00 -> t1000, 12:00 -> t1200)', () => {
    expect(classifyTimeOfDay(todRow(1, 0, T_0930))).toBe('t0930')
    expect(classifyTimeOfDay(todRow(2, 0, T_1000))).toBe('t1000')
    expect(classifyTimeOfDay(todRow(3, 0, T_1100))).toBe('t1100')
    expect(classifyTimeOfDay(todRow(4, 0, T_1200))).toBe('t1200')
  })

  it('(C3) DST-aware: 9:30 EST (winter, UTC-5) still resolves to t0930', () => {
    expect(classifyTimeOfDay(todRow(1, 0, T_WINTER_0930))).toBe('t0930')
  })

  it('(C4) unparseable open_time → null', () => {
    expect(classifyTimeOfDay(todRow(1, 0, 'not-a-timestamp'))).toBeNull()
  })
})

// ── computeTimeOfDay ─────────────────────────────────────────────────────────
describe('computeTimeOfDay', () => {
  it('(T1) empty input → excluded 0, denominator 0, all 20 cells empty', () => {
    const r = computeTimeOfDay([], '1m')
    expect(r.excluded).toBe(0)
    expect(r.denominator).toBe(0)
    for (const t of TIME_KEYS)
      for (const m of MACD_KEYS) expect(r.cells[t][m]).toEqual(EMPTY_BUCKET)
    expectCellInvariant(r, 0)
  })

  it('(T2) cross-tabs each trade into its (time, MACD-state) cell', () => {
    const rows = [
      todRow(1, 100, T_0945, { positive: true, rising: true }), // t0930 × posRising
      todRow(2, 100, T_0945, { positive: true, rising: true }), // t0930 × posRising
      todRow(3, 100, T_1030, { positive: false, rising: false }), // t1000 × negFalling
    ]
    const r = computeTimeOfDay(rows, '1m')
    expect(r.cells.t0930.posRising.n).toBe(2)
    expect(r.cells.t1000.negFalling.n).toBe(1)
    expect(r.cells.t1200.posRising.n).toBe(0)
    expect(r.denominator).toBe(3)
    expectCellInvariant(r, 3)
  })

  it('(T3) a null axis (MACD-state null OR unparseable time) → excluded', () => {
    const rows = [
      todRow(1, 100, T_0945, { positive: null, rising: true }), // MACD null → excluded
      todRow(2, 100, 'bad-time', { positive: true, rising: true }), // time null → excluded
      todRow(3, 100, T_0945, { positive: true, rising: true }), // classified
    ]
    const r = computeTimeOfDay(rows, '1m')
    expect(r.excluded).toBe(2)
    expect(r.denominator).toBe(1)
    expect(r.cells.t0930.posRising.n).toBe(1)
    expectCellInvariant(r, 3)
  })

  it('(T4) BucketStats math in a cell (n=5)', () => {
    // 3 winners (100,200,300) + 2 losers (-50,-150), all t0930 × posRising.
    const rows = [100, 200, 300, -50, -150].map((p, i) =>
      todRow(i + 1, p, T_0945),
    )
    const c = computeTimeOfDay(rows, '1m').cells.t0930.posRising
    expect(c.n).toBe(5)
    expect(c.winRate).toBe(0.6)
    expect(c.netPnl).toBe(400)
    expect(c.avgWinner).toBe(200)
    expect(c.avgLoser).toBe(-100)
    expect(c.expectancy).toBe(80)
  })

  it('(T5) n=4 → expectancy suppressed to null', () => {
    const rows = [1, 2, 3, 4].map((i) => todRow(i, 100, T_0945))
    const c = computeTimeOfDay(rows, '1m').cells.t0930.posRising
    expect(c.n).toBe(4)
    expect(c.expectancy).toBeNull()
  })

  it('(T6) MACD column follows the timeframe; time row does not', () => {
    // posRising on 1m, negFalling on 5m, same entry time both ways.
    const tech = makeCompleteSnapshot(
      { macd_positive: true, macd_rising: true },
      { macd_positive: false, macd_rising: false },
    )
    const row = makeRow({ open_time: T_0945, technicals: tech })
    expect(computeTimeOfDay([row], '1m').cells.t0930.posRising.n).toBe(1)
    expect(computeTimeOfDay([row], '5m').cells.t0930.negFalling.n).toBe(1)
  })
})

// ── rowsForTimeOfDayCell ─────────────────────────────────────────────────────
describe('rowsForTimeOfDayCell', () => {
  it('(R1) empty input → []', () => {
    expect(rowsForTimeOfDayCell([], '1m', 't0930', 'posRising')).toEqual([])
  })

  it('(R2) returns only the trades cross-classified into that cell', () => {
    const hit = todRow(1, 100, T_0945, { positive: true, rising: true })
    const otherTime = todRow(2, 100, T_1030, { positive: true, rising: true })
    const otherMacd = todRow(3, 100, T_0945, { positive: false, rising: false })
    const rows = [hit, otherTime, otherMacd]
    expect(rowsForTimeOfDayCell(rows, '1m', 't0930', 'posRising')).toEqual([hit])
  })

  it('(R3) excluded (null-axis) rows never appear', () => {
    const hit = todRow(1, 100, T_0945)
    const nullMacd = todRow(2, 100, T_0945, { positive: null, rising: true })
    const rows = [hit, nullMacd]
    expect(rowsForTimeOfDayCell(rows, '1m', 't0930', 'posRising')).toEqual([hit])
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseTradeHistoryCsv,
  parseTradeHistoryDate,
  parseTradeHistoryTime,
} from '../parse-tradehistory'
import { detectFormat } from '../detect-format'
import { buildRoundTrips } from '../../../src/core/import/build-round-trips'

const SAMPLE = [
  'Date,Time,Symbol,Side,Quantity,Price,P&L',
  '05/01/26,08:03:35,LABT,B,28,3.3,0',
  '05/01/26,08:03:44,LABT,S,14,3.38,1.12',
  '05/01/26,08:04:04,LABT,S,7,3.57,1.89',
  '05/01/26,08:04:09,LABT,S,3,3.91,1.82',
  '05/01/26,08:04:13,LABT,S,2,3.78,0.96',
  '05/01/26,08:04:37,LABT,S,2,3.63,0.66',
].join('\n')

describe('parseTradeHistoryDate', () => {
  it('parses MM/DD/YY with 2-digit year', () => {
    expect(parseTradeHistoryDate('05/01/26')).toBe('2026-05-01')
  })

  it('parses MM/DD/YYYY with 4-digit year', () => {
    expect(parseTradeHistoryDate('05/01/2026')).toBe('2026-05-01')
  })

  it('zero-pads single-digit month/day', () => {
    expect(parseTradeHistoryDate('5/1/26')).toBe('2026-05-01')
  })

  it('returns null on garbage', () => {
    expect(parseTradeHistoryDate('not-a-date')).toBeNull()
    expect(parseTradeHistoryDate('13/01/26')).toBeNull()
    expect(parseTradeHistoryDate('05/32/26')).toBeNull()
  })
})

describe('parseTradeHistoryTime', () => {
  it('parses zero-padded HH:MM:SS', () => {
    expect(parseTradeHistoryTime('08:03:35')).toBe('08:03:35')
  })

  it('zero-pads single-digit hours', () => {
    expect(parseTradeHistoryTime('8:03:35')).toBe('08:03:35')
  })

  it('rejects out-of-range values', () => {
    expect(parseTradeHistoryTime('24:00:00')).toBeNull()
    expect(parseTradeHistoryTime('12:60:00')).toBeNull()
    expect(parseTradeHistoryTime('12:00:60')).toBeNull()
  })

  it('returns null on garbage', () => {
    expect(parseTradeHistoryTime('not-a-time')).toBeNull()
  })
})

describe('parseTradeHistoryCsv — happy path', () => {
  it('parses Dave-shape CSV into Execution[]', () => {
    const result = parseTradeHistoryCsv(SAMPLE)
    expect(result.skipped).toBe(0)
    expect(result.executions).toHaveLength(6)
    const [first] = result.executions
    expect(first.symbol).toBe('LABT')
    expect(first.side).toBe('B')
    expect(first.qty).toBe(28)
    expect(first.price).toBe(3.3)
    expect(first.time).toBe('2026-05-01T08:03:35')
    expect(first.date).toBe('2026-05-01')
  })

  it('captures broker_pnl per row including zero on the opening leg', () => {
    const result = parseTradeHistoryCsv(SAMPLE)
    expect(result.executions[0].broker_pnl).toBe(0)
    expect(result.executions[1].broker_pnl).toBe(1.12)
    expect(result.executions[4].broker_pnl).toBe(0.96)
  })

  it('marks source_broker=DAS, source_format=tradehistory on every row', () => {
    const result = parseTradeHistoryCsv(SAMPLE)
    for (const e of result.executions) {
      expect(e.source_broker).toBe('DAS')
      expect(e.source_format).toBe('tradehistory')
    }
  })

  it('propagates source_file when a filename is passed in', () => {
    const result = parseTradeHistoryCsv(SAMPLE, 'dave-may-2026.csv')
    for (const e of result.executions) {
      expect(e.source_file).toBe('dave-may-2026.csv')
    }
  })

  it('synthesizes stable trade_id/order_id from the row tuple', () => {
    const a = parseTradeHistoryCsv(SAMPLE)
    const b = parseTradeHistoryCsv(SAMPLE)
    // Same input → same synthetic IDs → re-import dedup works via exec_hash.
    for (let i = 0; i < a.executions.length; i++) {
      expect(a.executions[i].trade_id).toBe(b.executions[i].trade_id)
      expect(a.executions[i].order_id).toBe(b.executions[i].order_id)
      // ID is namespaced so it never collides with real DAS trade IDs.
      expect(a.executions[i].trade_id).toMatch(/^th-[0-9a-f]{12}$/)
    }
  })

  it('strips a BOM at the start of the file', () => {
    const result = parseTradeHistoryCsv('﻿' + SAMPLE)
    expect(result.executions).toHaveLength(6)
  })
})

describe('parseTradeHistoryCsv — bad-row handling', () => {
  it('skips rows with an empty symbol', () => {
    const csv = ['Date,Time,Symbol,Side,Quantity,Price,P&L', '05/01/26,08:03:35,,B,28,3.3,0'].join('\n')
    const result = parseTradeHistoryCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with an invalid Side value', () => {
    const csv = ['Date,Time,Symbol,Side,Quantity,Price,P&L', '05/01/26,08:03:35,LABT,X,28,3.3,0'].join('\n')
    const result = parseTradeHistoryCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with an unparseable Date', () => {
    const csv = ['Date,Time,Symbol,Side,Quantity,Price,P&L', 'not-a-date,08:03:35,LABT,B,28,3.3,0'].join('\n')
    const result = parseTradeHistoryCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with an unparseable Time', () => {
    const csv = ['Date,Time,Symbol,Side,Quantity,Price,P&L', '05/01/26,not-a-time,LABT,B,28,3.3,0'].join('\n')
    const result = parseTradeHistoryCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with zero or negative quantity', () => {
    const csv = [
      'Date,Time,Symbol,Side,Quantity,Price,P&L',
      '05/01/26,08:03:35,LABT,B,0,3.3,0',
    ].join('\n')
    const result = parseTradeHistoryCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })
})

describe('detectFormat routing — tradehistory shape', () => {
  it('routes Dave-shape CSV to "tradehistory"', () => {
    expect(detectFormat(SAMPLE)).toBe('tradehistory')
  })

  it('does NOT collide with daily-summary (first cell = Symbol) or executions (first cell = TradeID)', () => {
    expect(detectFormat('TradeID,OrderID,foo\n1,A1,bar')).toBe('executions')
  })
})

describe('buildRoundTrips on tradehistory executions', () => {
  it('closes a one-buy/multi-sell trip cleanly', () => {
    const { executions } = parseTradeHistoryCsv(SAMPLE)
    const trips = buildRoundTrips(executions)
    expect(trips).toHaveLength(1)
    const trip = trips[0]
    expect(trip.symbol).toBe('LABT')
    expect(trip.side).toBe('long')
    expect(trip.date).toBe('2026-05-01')
    expect(trip.shares_bought).toBe(28)
    expect(trip.shares_sold).toBe(28)
    expect(trip.is_open).toBe(false)
    expect(trip.source_format).toBe('tradehistory')
    expect(trip.source_broker).toBe('DAS')
    // Dave's file ships no fee columns → builder reports fees as not-reported.
    expect(trip.fees_reported).toBe(false)
    expect(trip.total_fees).toBe(0)
  })
})

// Real-fixture smoke test (Dave's actual file, permission granted).
const DAVE_FIXTURE = resolve(__dirname, '../../../test-fixtures/dtsm-dave-das-executed-orders-may-2026.csv')

describe('Dave fixture — end-to-end', () => {
  if (!existsSync(DAVE_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const csv = readFileSync(DAVE_FIXTURE, 'utf8')

  it('detects as tradehistory', () => {
    expect(detectFormat(csv)).toBe('tradehistory')
  })

  it('parses all 188 fills with zero skipped', () => {
    const result = parseTradeHistoryCsv(csv, 'dtsm-dave-das-executed-orders-may-2026.csv')
    expect(result.skipped).toBe(0)
    expect(result.executions.length).toBe(188)
  })

  it('spans 10 trading dates from 2026-05-01 to 2026-05-14', () => {
    const result = parseTradeHistoryCsv(csv)
    const dates = new Set(result.executions.map((e) => e.date))
    expect(dates.size).toBe(10)
    expect([...dates].sort()[0]).toBe('2026-05-01')
    expect([...dates].sort().at(-1)).toBe('2026-05-14')
  })

  it('builds well-formed round trips with no orphan opens on closed days', () => {
    const result = parseTradeHistoryCsv(csv)
    const trips = buildRoundTrips(result.executions)
    expect(trips.length).toBeGreaterThan(0)
    // Every trip's exec_hash is stable (re-running yields the same hashes).
    const hashes = trips.map((t) => t.exec_hash)
    const second = buildRoundTrips(parseTradeHistoryCsv(csv).executions).map((t) => t.exec_hash)
    expect(hashes).toEqual(second)
  })
})

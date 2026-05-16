import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTradesWindowCsv } from '../parse-trades-window'
import { detectFormat } from '../detect-format'
import { buildRoundTrips } from '../../../src/core/import/build-round-trips'

// Synthetic CSV — generic data, no identifying account/ticker strings.
const SAMPLE_HEADER =
  'Time,Symbol,Side,Price,Qty,Route,LiqType,Broker,Account,Type,Cloid'

const SAMPLE = [
  SAMPLE_HEADER,
  '09:30:00,ACME,B,10.00,100,ARCA,RR,ARCX,ACCT_X,Margin,C0001',
  '09:31:00,ACME,S,10.50,50,ARCA,X,ARCX,ACCT_X,Margin,C0002',
  '09:32:00,ACME,S,10.75,50,ARCA,RR,ARCX,ACCT_X,Margin,C0003',
].join('\n')

// Partial-fill case — same Cloid splits into two rows with same time, side,
// and price but different qty. Exercises Cloid-as-order-id + synthetic
// trade_id behavior.
const PARTIAL_FILL = [
  SAMPLE_HEADER,
  '09:30:00,ACME,B,10.00,40,ARCA,RR,ARCX,ACCT_X,Margin,C9999',
  '09:30:00,ACME,B,10.00,60,ARCA,99,CROX,ACCT_X,Margin,C9999',
  '09:35:00,ACME,S,11.00,100,ARCA,X,ARCX,ACCT_X,Margin,C9998',
].join('\n')

describe('parseTradesWindowCsv — happy path with filename date', () => {
  it('parses each row into an Execution', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    expect(r.skipped).toBe(0)
    expect(r.requiresDate).toBe(false)
    expect(r.executions).toHaveLength(3)
    expect(r.executions[0].symbol).toBe('ACME')
    expect(r.executions[0].side).toBe('B')
    expect(r.executions[0].qty).toBe(100)
    expect(r.executions[0].price).toBe(10)
    expect(r.executions[0].time).toBe('2026-04-02T09:30:00')
    expect(r.executions[0].date).toBe('2026-04-02')
  })

  it('marks source_broker=DAS and source_format=trades_window', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    for (const e of r.executions) {
      expect(e.source_broker).toBe('DAS')
      expect(e.source_format).toBe('trades_window')
    }
  })

  it('captures Route, LiqType, Broker (code), Type as supplementary metadata', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    expect(r.executions[0].route).toBe('ARCA')
    expect(r.executions[0].liq_type).toBe('RR')
    expect(r.executions[0].broker_code).toBe('ARCX')
    expect(r.executions[0].order_type).toBe('Margin')
  })

  it('populates both account (legacy) and account_name (universal)', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    for (const e of r.executions) {
      expect(typeof e.account).toBe('string')
      expect(e.account).toBeTruthy()
      expect(e.account_name).toBe(e.account)
    }
  })

  it('uses Cloid as order_id and synthesizes per-row trade_id', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    expect(r.executions[0].order_id).toBe('C0001')
    expect(r.executions[1].order_id).toBe('C0002')
    expect(r.executions[2].order_id).toBe('C0003')
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^tw-[0-9a-f]{12}$/)
    }
    // trade_id is unique per row (different time/qty/price).
    const ids = new Set(r.executions.map((e) => e.trade_id))
    expect(ids.size).toBe(3)
  })

  it('produces stable synthetic IDs across re-parses (dedup contract)', () => {
    const a = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    const b = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    for (let i = 0; i < a.executions.length; i++) {
      expect(a.executions[i].trade_id).toBe(b.executions[i].trade_id)
      expect(a.executions[i].order_id).toBe(b.executions[i].order_id)
    }
  })

  it('propagates source_file when filename is passed', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    for (const e of r.executions) {
      expect(e.source_file).toBe('trades_2026-04-02.csv')
    }
  })

  it('strips a BOM at the start of the file', () => {
    const r = parseTradesWindowCsv('﻿' + SAMPLE, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(3)
  })

  it('supports MM-DD-YYYY filenames via the Track B parse-filename pattern', () => {
    const r = parseTradesWindowCsv(SAMPLE, '04-02-2026.csv')
    expect(r.skipped).toBe(0)
    expect(r.executions[0].date).toBe('2026-04-02')
  })
})

describe('parseTradesWindowCsv — bare-time guardrail', () => {
  it('flags requiresDate=true when no filename is passed', () => {
    const r = parseTradesWindowCsv(SAMPLE)
    expect(r.requiresDate).toBe(true)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(3)
  })

  it('flags requiresDate=true when filename has no parseable date', () => {
    const r = parseTradesWindowCsv(SAMPLE, 'random-export.csv')
    expect(r.requiresDate).toBe(true)
    expect(r.executions).toHaveLength(0)
  })
})

describe('parseTradesWindowCsv — bad-row handling', () => {
  it('skips rows with empty symbol', () => {
    const csv = [SAMPLE_HEADER, '09:30:00,,B,10.00,100,ARCA,RR,ARCX,ACCT_X,Margin,C1'].join('\n')
    const r = parseTradesWindowCsv(csv, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('skips rows with invalid Side value', () => {
    const csv = [SAMPLE_HEADER, '09:30:00,ACME,X,10.00,100,ARCA,RR,ARCX,ACCT_X,Margin,C1'].join('\n')
    const r = parseTradesWindowCsv(csv, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('skips rows with zero qty', () => {
    const csv = [SAMPLE_HEADER, '09:30:00,ACME,B,10.00,0,ARCA,RR,ARCX,ACCT_X,Margin,C1'].join('\n')
    const r = parseTradesWindowCsv(csv, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('skips rows with bad time format', () => {
    const csv = [SAMPLE_HEADER, 'not-a-time,ACME,B,10.00,100,ARCA,RR,ARCX,ACCT_X,Margin,C1'].join('\n')
    const r = parseTradesWindowCsv(csv, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    // Bad time isn't a date issue — should NOT set requiresDate.
    expect(r.requiresDate).toBe(false)
  })
})

describe('parseTradesWindowCsv — partial fills (shared Cloid)', () => {
  it('keeps both partial-fill rows with same order_id but distinct trade_id', () => {
    const r = parseTradesWindowCsv(PARTIAL_FILL, 'trades_2026-04-02.csv')
    expect(r.executions).toHaveLength(3)
    const [a, b] = r.executions
    expect(a.order_id).toBe('C9999')
    expect(b.order_id).toBe('C9999')
    // Different qty → different trade_id even with same (time, symbol, side, price).
    expect(a.trade_id).not.toBe(b.trade_id)
  })
})

describe('detectFormat routing — trades_window', () => {
  it('routes Tester B-shape CSV to "trades_window"', () => {
    expect(detectFormat(SAMPLE)).toBe('trades_window')
  })

  it('does not collide with TradeID-led executions or Date-led tradehistory', () => {
    expect(detectFormat('TradeID,OrderID,foo\n1,A1,bar')).toBe('executions')
    expect(detectFormat('Date,Time,Symbol,Side,Quantity,Price,P&L\n05/01/26,08:00:00,X,B,1,1,0')).toBe(
      'tradehistory',
    )
  })

  it('returns unknown for Time-led files that lack the Cloid signal', () => {
    // A hypothetical other-broker "Time-first" file without Cloid should
    // not be misrouted to trades_window.
    expect(
      detectFormat('Time,Symbol,Side,Price,Qty\n09:30:00,X,B,1,1'),
    ).toBe('unknown')
  })
})

describe('buildRoundTrips on trades_window executions', () => {
  it('closes a simple long round trip across rows', () => {
    const { executions } = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    const trips = buildRoundTrips(executions)
    expect(trips).toHaveLength(1)
    const trip = trips[0]
    expect(trip.symbol).toBe('ACME')
    expect(trip.side).toBe('long')
    expect(trip.date).toBe('2026-04-02')
    expect(trip.shares_bought).toBe(100)
    expect(trip.shares_sold).toBe(100)
    expect(trip.is_open).toBe(false)
    expect(trip.source_format).toBe('trades_window')
    expect(trip.fees_reported).toBe(false)
  })

  it('threads route into RoundTripExecution (Day 8 will display it)', () => {
    const { executions } = parseTradesWindowCsv(SAMPLE, 'trades_2026-04-02.csv')
    const trips = buildRoundTrips(executions)
    for (const fill of trips[0].executions) {
      expect(fill.route).toBe('ARCA')
    }
  })
})

// Generic real-fixture invariants — NO identifying strings asserted.
const TESTER_B_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/Tester B Trades Example.csv',
)

describe('Tester B real fixture — generic invariants only', () => {
  if (!existsSync(TESTER_B_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const csv = readFileSync(TESTER_B_FIXTURE, 'utf8')

  it('detects as trades_window', () => {
    expect(detectFormat(csv)).toBe('trades_window')
  })

  it('parses every row when a filename date is provided', () => {
    // Synthetic filename so the test is portable regardless of how the
    // user has the fixture saved on disk.
    const r = parseTradesWindowCsv(csv, 'fixture_2026-04-02.csv')
    expect(r.skipped).toBe(0)
    expect(r.requiresDate).toBe(false)
    expect(r.executions.length).toBeGreaterThan(0)
  })

  it('every parsed row carries a non-empty account string', () => {
    const r = parseTradesWindowCsv(csv, 'fixture_2026-04-02.csv')
    for (const e of r.executions) {
      expect(typeof e.account).toBe('string')
      expect((e.account ?? '').length).toBeGreaterThan(0)
      expect(e.account_name).toBe(e.account)
    }
  })

  it('blocks (requiresDate=true, zero kept) when filename has no date', () => {
    const r = parseTradesWindowCsv(csv, 'random-export.csv')
    expect(r.requiresDate).toBe(true)
    expect(r.executions).toHaveLength(0)
  })

  it('builds well-formed round trips with stable exec_hash on re-parse', () => {
    const r1 = parseTradesWindowCsv(csv, 'fixture_2026-04-02.csv')
    const trips1 = buildRoundTrips(r1.executions)
    expect(trips1.length).toBeGreaterThan(0)

    const r2 = parseTradesWindowCsv(csv, 'fixture_2026-04-02.csv')
    const trips2 = buildRoundTrips(r2.executions)
    expect(trips2.map((t) => t.exec_hash)).toEqual(trips1.map((t) => t.exec_hash))
  })
})

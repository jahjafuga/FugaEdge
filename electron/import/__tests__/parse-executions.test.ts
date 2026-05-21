import { describe, expect, it } from 'vitest'
import { parseExecutionsCsv } from '../parse-executions'

const SAMPLE = [
  'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
  '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,05/15/26 09:30:00',
  '2,A2,J,ACCT,BR,ARCA,foo,r2,S,N,NSDQ,AAPL,100,151.00,05/15/26 09:31:00',
].join('\n')

describe('parseExecutionsCsv — happy path', () => {
  it('parses DAS Trades.csv into Execution[] with the expected DAS fields', () => {
    const result = parseExecutionsCsv(SAMPLE)
    expect(result.skipped).toBe(0)
    expect(result.executions).toHaveLength(2)
    const [first, second] = result.executions
    expect(first.symbol).toBe('AAPL')
    expect(first.side).toBe('B')
    expect(first.qty).toBe(100)
    expect(first.price).toBe(150.5)
    // 09:30 ET (EDT) → 13:30 UTC. `date` stays the Eastern trading day.
    expect(first.time).toBe('2026-05-15T13:30:00Z')
    expect(first.date).toBe('2026-05-15')
    expect(first.trade_id).toBe('1')
    expect(first.order_id).toBe('A1')
    expect(first.account).toBe('ACCT')
    expect(first.route).toBe('ARCA')
    expect(second.side).toBe('S')
  })

  it('sets source_broker=DAS and source_format=execution on every row', () => {
    const result = parseExecutionsCsv(SAMPLE)
    for (const e of result.executions) {
      expect(e.source_broker).toBe('DAS')
      expect(e.source_format).toBe('execution')
    }
  })

  it('propagates source_file when a filename is passed in', () => {
    const result = parseExecutionsCsv(SAMPLE, 'trades_15thmay.csv')
    for (const e of result.executions) {
      expect(e.source_file).toBe('trades_15thmay.csv')
    }
  })

  it('leaves source_file undefined when no filename is passed (legacy call sites)', () => {
    const result = parseExecutionsCsv(SAMPLE)
    for (const e of result.executions) {
      expect(e.source_file).toBeUndefined()
    }
  })

  it('does NOT set account_name (decision D — exec_hash compatibility)', () => {
    const result = parseExecutionsCsv(SAMPLE)
    for (const e of result.executions) {
      expect(e.account_name).toBeUndefined()
      // The legacy `account` field is still populated for informational use.
      expect(e.account).toBe('ACCT')
    }
  })

  it('strips a BOM at the start of the file', () => {
    const result = parseExecutionsCsv('﻿' + SAMPLE)
    expect(result.executions).toHaveLength(2)
  })
})

describe('parseExecutionsCsv — bad row handling', () => {
  it('skips rows with an empty symbol', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,,100,150.50,05/15/26 09:30:00',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with an invalid B/S value', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,X,N,NSDQ,AAPL,100,150.50,05/15/26 09:30:00',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips rows with an unparseable time field', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,not-a-time',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.requiresDate).toBe(false)
  })
})

describe('parseExecutionsCsv — bare-time fallback', () => {
  const BARE_TIME_CSV = [
    'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
    '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,09:30:00',
    '2,A2,J,ACCT,BR,ARCA,foo,r2,S,N,NSDQ,AAPL,100,151.00,09:31:00',
  ].join('\n')

  it('uses filename-derived date when time column is bare', () => {
    const result = parseExecutionsCsv(BARE_TIME_CSV, 'trades_2026-05-15.csv')
    expect(result.skipped).toBe(0)
    expect(result.requiresDate).toBe(false)
    expect(result.executions).toHaveLength(2)
    expect(result.executions[0].date).toBe('2026-05-15')
    expect(result.executions[0].time).toBe('2026-05-15T13:30:00Z')
  })

  it('uses MM-DD-YYYY filenames via the new parse-filename pattern', () => {
    const result = parseExecutionsCsv(BARE_TIME_CSV, '05-15-2026.csv')
    expect(result.skipped).toBe(0)
    expect(result.executions[0].date).toBe('2026-05-15')
  })

  it('flags requiresDate=true when bare time + no filename hint', () => {
    const result = parseExecutionsCsv(BARE_TIME_CSV)
    expect(result.requiresDate).toBe(true)
    expect(result.executions).toHaveLength(0)
    expect(result.skipped).toBe(2)
  })

  it('flags requiresDate=true when bare time + filename has no date', () => {
    const result = parseExecutionsCsv(BARE_TIME_CSV, 'random-export.csv')
    expect(result.requiresDate).toBe(true)
    expect(result.executions).toHaveLength(0)
  })
})

describe('parseExecutionsCsv — optional P/L column', () => {
  it('captures broker_pnl from a "P/L" column when present', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time,P/L',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,05/15/26 09:30:00,0',
      '2,A2,J,ACCT,BR,ARCA,foo,r2,S,N,NSDQ,AAPL,100,151.00,05/15/26 09:31:00,50.00',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions[0].broker_pnl).toBe(0)
    expect(result.executions[1].broker_pnl).toBe(50)
  })

  it('captures broker_pnl from a "P&L" column variant', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time,P&L',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,05/15/26 09:30:00,-3.14',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions[0].broker_pnl).toBe(-3.14)
  })

  it('leaves broker_pnl undefined when no P/L column is present', () => {
    const csv = [
      'TradeID,OrderID,Trader,Account,Branch,route,bkrsym,rrno,B/S,SHORT,Market,symb,qty,price,time',
      '1,A1,J,ACCT,BR,ARCA,foo,r1,B,N,NSDQ,AAPL,100,150.50,05/15/26 09:30:00',
    ].join('\n')
    const result = parseExecutionsCsv(csv)
    expect(result.executions[0].broker_pnl).toBeUndefined()
  })
})

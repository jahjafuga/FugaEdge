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
    expect(first.time).toBe('2026-05-15T09:30:00')
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
  })
})

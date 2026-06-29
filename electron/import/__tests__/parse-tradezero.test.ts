import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseTradeZeroCsv,
  normalizeTradeZeroSide,
  parseTradeZeroDate,
  parseTradeZeroTime,
} from '../parse-tradezero'
import { detectFormat } from '../detect-format'
import { buildRoundTrips } from '@/core/import/build-round-trips'

// Synthetic CSV — generic tickers, no identifying account or PII. The real
// (sanitized) TradeZero export is exercised by the existsSync-guarded block at
// the bottom; it lives in the gitignored test-fixtures/ and never reaches CI.
const SAMPLE_HEADER =
  'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note'

const SAMPLE = [
  SAMPLE_HEADER,
  'ACCT1,06/15/2026,06/17/2026,USD,Limit,B,ACME,100,12.00,09:30:00,0.50,0.01,0.01,0.01,0.00,0.30,0.00,1200.00,1200.83,DTCC,Add,',
  'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,100,12.50,09:45:00,0.50,0.02,0.01,0.01,0.00,0.30,0.00,1250.00,1249.16,DTCC,Remove,',
  'ACCT1,06/15/2026,06/17/2026,USD,Market,B,ZZZZ,50,8.00,10:00:00,0.50,0.00,0.00,0.00,0.00,0.00,0.00,400.00,400.50,DTCC,Add,',
].join('\n')

describe('parseTradeZeroCsv — happy path', () => {
  it('parses each row into an Execution', () => {
    const r = parseTradeZeroCsv(SAMPLE, 'tradezero.csv')
    expect(r.skipped).toBe(0)
    expect(r.executions).toHaveLength(3)
    expect(r.executions[0].symbol).toBe('ACME')
    expect(r.executions[0].side).toBe('B')
    expect(r.executions[0].qty).toBe(100)
    expect(r.executions[0].price).toBe(12)
    // 09:30:00 ET on 06/15 (June → EDT, UTC-4) → 13:30:00 UTC. `date` stays Eastern.
    expect(r.executions[0].time).toBe('2026-06-15T13:30:00Z')
    expect(r.executions[0].date).toBe('2026-06-15')
  })

  it('covers the distinct symbols in the batch', () => {
    const r = parseTradeZeroCsv(SAMPLE, 'tradezero.csv')
    const symbols = new Set(r.executions.map((e) => e.symbol))
    expect(symbols).toEqual(new Set(['ACME', 'ZZZZ']))
  })

  it('tags source_broker=TradeZero, source_format=execution, and source_file', () => {
    const r = parseTradeZeroCsv(SAMPLE, 'tradezero.csv')
    for (const e of r.executions) {
      expect(e.source_broker).toBe('TradeZero')
      expect(e.source_format).toBe('execution')
      expect(e.source_file).toBe('tradezero.csv')
    }
  })

  it('maps Account → account_name and the descriptive columns', () => {
    const r = parseTradeZeroCsv(SAMPLE, 'tradezero.csv')
    expect(r.executions[0].account_name).toBe('ACCT1')
    expect(r.executions[0].order_type).toBe('Limit')
    expect(r.executions[0].broker_code).toBe('DTCC')
    expect(r.executions[0].liq_type).toBe('Add')
  })

  it('synthesizes tz-prefixed IDs in the expected shape', () => {
    const r = parseTradeZeroCsv(SAMPLE, 'tradezero.csv')
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^tz-[0-9a-f]{12}$/)
      // No source per-fill ID → trade_id and order_id collapse.
      expect(e.order_id).toBe(e.trade_id)
    }
  })

  it('produces stable IDs across re-parse and distinct IDs per row', () => {
    const a = parseTradeZeroCsv(SAMPLE)
    const b = parseTradeZeroCsv(SAMPLE)
    expect(a.executions[0].trade_id).toBe(b.executions[0].trade_id)
    const ids = new Set(a.executions.map((e) => e.trade_id))
    expect(ids.size).toBe(3)
  })

  it('always flags is_short:false — shorts are inferred downstream', () => {
    const r = parseTradeZeroCsv(SAMPLE)
    for (const e of r.executions) expect(e.is_short).toBe(false)
  })

  it('strips a leading BOM before parsing', () => {
    const r = parseTradeZeroCsv('﻿' + SAMPLE, 'tradezero.csv')
    expect(r.executions).toHaveLength(3)
  })
})

describe('parseTradeZeroCsv — fee mapping (sign-preserving)', () => {
  // Comm 0.50, SEC 0.02, TAF 0.01, NSCC 0.03 + Nasdaq 0.04 = other 0.07,
  // ECN Remove 0.30 + ECN Add (0.20) rebate = ecn 0.10.  Σfees = 0.70.
  // Gross 1250.00 - 0.70 = 1249.30 = Net.
  const FEE_CSV = [
    SAMPLE_HEADER,
    'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,100,12.50,09:45:00,0.50,0.02,0.01,0.03,0.04,0.30,(0.20),1250.00,1249.30,DTCC,Remove,',
  ].join('\n')

  it('maps each TradeZero fee column to the right Execution field', () => {
    const e = parseTradeZeroCsv(FEE_CSV).executions[0]
    expect(e.commission).toBeCloseTo(0.5, 2)
    expect(e.sec_fee).toBeCloseTo(0.02, 2)
    expect(e.finra_fee).toBeCloseTo(0.01, 2) // TAF → finra_fee
    expect(e.other_fees).toBeCloseTo(0.07, 2) // NSCC + Nasdaq
    expect(e.ecn_fee).toBeCloseTo(0.1, 2) // ECN Remove + ECN Add(rebate)
  })

  it('reconciles Gross - Σfees ≈ Net per row (sign check)', () => {
    const e = parseTradeZeroCsv(FEE_CSV).executions[0]
    const sumFees =
      (e.commission ?? 0) +
      (e.sec_fee ?? 0) +
      (e.finra_fee ?? 0) +
      (e.other_fees ?? 0) +
      (e.ecn_fee ?? 0)
    const GROSS = 1250.0
    const NET = 1249.3
    expect(GROSS - sumFees).toBeCloseTo(NET, 2)
  })

  it('keeps an ECN Add rebate NEGATIVE (parens and literal-minus forms)', () => {
    const REBATE_CSV = [
      SAMPLE_HEADER,
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,100,12.50,09:45:00,0,0,0,0,0,0.00,(0.30),1250.00,1250.30,DTCC,Add,',
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,100,12.50,09:46:00,0,0,0,0,0,0.00,-0.25,1250.00,1250.25,DTCC,Add,',
    ].join('\n')
    const r = parseTradeZeroCsv(REBATE_CSV)
    expect(r.executions[0].ecn_fee).toBeCloseTo(-0.3, 2)
    expect(r.executions[1].ecn_fee).toBeCloseTo(-0.25, 2)
    expect(r.executions[0].ecn_fee).toBeLessThan(0)
    expect(r.executions[1].ecn_fee).toBeLessThan(0)
  })
})

describe('parseTradeZeroCsv — bad-row handling', () => {
  const row = (over: Partial<Record<string, string>> = {}): string => {
    const base: Record<string, string> = {
      Side: 'B',
      Symbol: 'ACME',
      Qty: '100',
      Price: '12.00',
      'Exec Time': '09:30:00',
    }
    const m = { ...base, ...over }
    return `ACCT1,06/15/2026,06/17/2026,USD,Limit,${m.Side},${m.Symbol},${m.Qty},${m.Price},${m['Exec Time']},0,0,0,0,0,0,0,0,0,DTCC,Add,`
  }
  const reasonOf = (csv: string): string | undefined =>
    parseTradeZeroCsv([SAMPLE_HEADER, csv].join('\n')).trace.find(
      (t) => t.outcome === 'skipped',
    )?.reason

  it('skips a row with an empty symbol', () => {
    const r = parseTradeZeroCsv([SAMPLE_HEADER, row({ Symbol: '' })].join('\n'))
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(reasonOf(row({ Symbol: '' }))).toBe('empty-symbol')
  })

  it('skips a row with an unrecognized side', () => {
    const r = parseTradeZeroCsv([SAMPLE_HEADER, row({ Side: 'X' })].join('\n'))
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(reasonOf(row({ Side: 'X' }))).toContain('bad-side')
  })

  it('skips a row with zero quantity', () => {
    expect(reasonOf(row({ Qty: '0' }))).toBe('zero-qty')
  })

  it('skips a row with a malformed exec time', () => {
    expect(reasonOf(row({ 'Exec Time': '25:99:99' }))).toContain('bad-time')
  })

  it('skips a row with a malformed trade date', () => {
    const bad =
      'ACCT1,13/45/2026,06/17/2026,USD,Limit,B,ACME,100,12.00,09:30:00,0,0,0,0,0,0,0,0,0,DTCC,Add,'
    expect(reasonOf(bad)).toContain('bad-date')
  })
})

describe('parseTradeZeroCsv — empty / header-only', () => {
  it('returns no executions for a header-only file', () => {
    const r = parseTradeZeroCsv(SAMPLE_HEADER)
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(0)
  })

  it('returns no executions for an empty string', () => {
    const r = parseTradeZeroCsv('')
    expect(r.executions).toHaveLength(0)
  })
})

describe('parseTradeZeroCsv — round-trip side inference (no builder change)', () => {
  it('infers SHORT from a sell-before-buy sequence', () => {
    const SHORT_CSV = [
      SAMPLE_HEADER,
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,100,12.50,09:30:00,0,0,0,0,0,0,0,1250.00,1250.00,DTCC,Add,',
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,B,ACME,100,12.00,09:45:00,0,0,0,0,0,0,0,1200.00,1200.00,DTCC,Remove,',
    ].join('\n')
    const trips = buildRoundTrips(parseTradeZeroCsv(SHORT_CSV).executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('short')
  })

  it('folds an add-to-position into one LONG round-trip', () => {
    const ADD_CSV = [
      SAMPLE_HEADER,
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,B,ACME,100,10.00,09:30:00,0,0,0,0,0,0,0,1000.00,1000.00,DTCC,Add,',
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,B,ACME,50,11.00,09:35:00,0,0,0,0,0,0,0,550.00,550.00,DTCC,Add,',
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,S,ACME,150,12.00,09:45:00,0,0,0,0,0,0,0,1800.00,1800.00,DTCC,Remove,',
    ].join('\n')
    const trips = buildRoundTrips(parseTradeZeroCsv(ADD_CSV).executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('long')
  })
})

describe('detectFormat routing — tradezero', () => {
  it('routes the TradeZero header to "tradezero"', () => {
    expect(detectFormat(SAMPLE)).toBe('tradezero')
  })

  it('pins detection against the real File-1 header shape (regression)', () => {
    // The exact first line of a real TradeZero File-1 export — verified by
    // hexdump against the user's tradezero-user-execution.csv (no BOM, exact
    // case + single space in "Exec Time"). Frozen here, DECOUPLED from
    // SAMPLE_HEADER, so a future detect-format refactor (or an edit to SAMPLE
    // for some other test) can't silently drop TradeZero detection. The
    // gitignored real fixture is parsed directly elsewhere, bypassing
    // detectFormat — this is the only committed assertion on the real header.
    const REAL_TZ_FILE1_HEADER =
      'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note'
    const oneRow =
      'ACCT1,06/15/2026,06/17/2026,USD,Limit,B,ACME,100,12.00,09:30:00,0.50,0.01,0.01,0.01,0.00,0.30,0.00,1200.00,1200.83,DTCC,Add,'
    expect(detectFormat(`${REAL_TZ_FILE1_HEADER}\n${oneRow}`)).toBe('tradezero')
  })

  it('strips a BOM before sniffing', () => {
    expect(detectFormat('﻿' + SAMPLE)).toBe('tradezero')
  })

  it('does not collide with any of the other CSV shapes', () => {
    expect(
      detectFormat('TradeID,OrderID,B/S,Symbol,Qty,Price,Time\n1,A1,B,X,100,10,09:30'),
    ).toBe('executions')
    expect(
      detectFormat('Date,Time,Symbol,Side,Quantity,Price,P&L\n05/14/26,09:30:00,X,B,100,10,0'),
    ).toBe('tradehistory')
    expect(
      detectFormat(
        'Time,Symbol,Side,Price,Qty,Route,LiqType,Broker,Account,Type,Cloid\n09:30:00,X,B,10,100,ARCA,RR,ARCX,A,Margin,C1',
      ),
    ).toBe('trades_window')
    expect(
      detectFormat(
        'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time\nAcme,ACME,Buy,Filled,1,1,@1,1,DAY,05/14/2026 09:30:00 EDT,05/14/2026 09:30:00 EDT',
      ),
    ).toBe('webull_mobile')
    expect(detectFormat('Symbol,ECN,FINRA,HTB\nXYZ,1.00,0.10,0.50')).toBe('daily-summary')
  })

  it('returns "unknown" for an Account-led header missing the TradeZero markers', () => {
    // Leads with Account but lacks T/D + Exec Time → must not false-match.
    expect(detectFormat('Account,Symbol,Price\nA,ABC,10')).toBe('unknown')
    // Has T/D but no Exec Time.
    expect(detectFormat('Account,T/D,Symbol\nA,06/15/2026,ABC')).toBe('unknown')
  })
})

describe('TradeZero exported helpers', () => {
  it('normalizeTradeZeroSide maps the known forms', () => {
    expect(normalizeTradeZeroSide('B')).toBe('B')
    expect(normalizeTradeZeroSide('buy')).toBe('B')
    expect(normalizeTradeZeroSide('S')).toBe('S')
    expect(normalizeTradeZeroSide('Sell')).toBe('S')
    expect(normalizeTradeZeroSide('SS')).toBe('S') // short sell → S (builder infers short)
    expect(normalizeTradeZeroSide('X')).toBeNull()
    expect(normalizeTradeZeroSide('')).toBeNull()
  })

  it('parseTradeZeroDate normalizes MM/DD/YYYY to ISO', () => {
    expect(parseTradeZeroDate('06/15/2026')).toBe('2026-06-15')
    expect(parseTradeZeroDate('6/5/2026')).toBe('2026-06-05')
    expect(parseTradeZeroDate('13/45/2026')).toBeNull()
    expect(parseTradeZeroDate('')).toBeNull()
  })

  it('parseTradeZeroTime validates HH:MM:SS', () => {
    expect(parseTradeZeroTime('09:30:00')).toBe('09:30:00')
    expect(parseTradeZeroTime('04:12:51')).toBe('04:12:51')
    expect(parseTradeZeroTime('25:99:99')).toBeNull()
    expect(parseTradeZeroTime('9:30')).toBeNull()
    expect(parseTradeZeroTime('')).toBeNull()
  })
})

// ── Real sanitized fixture — generic invariants only, NO PII asserted. ───────
// Lives in the gitignored test-fixtures/ (real user data, local only). Skipped
// automatically in CI / fresh clones where the file isn't present.
const TRADEZERO_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/tradezero-user-execution.csv',
)

describe('TradeZero real fixture — generic invariants only', () => {
  if (!existsSync(TRADEZERO_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const csv = readFileSync(TRADEZERO_FIXTURE, 'utf8')
  const r = parseTradeZeroCsv(csv, 'tradezero-user-execution.csv')

  it('parses all 61 rows as executions with zero skipped', () => {
    expect(r.executions).toHaveLength(61)
    expect(r.skipped).toBe(0)
  })

  it('covers 8 distinct symbols on the single trading day 2026-06-15', () => {
    const symbols = new Set(r.executions.map((e) => e.symbol))
    expect(symbols.size).toBe(8)
    const dates = new Set(r.executions.map((e) => e.date))
    expect(dates.size).toBe(1)
    expect([...dates][0]).toBe('2026-06-15')
  })

  it('tags every row source_broker=TradeZero / source_format=execution', () => {
    for (const e of r.executions) {
      expect(e.source_broker).toBe('TradeZero')
      expect(e.source_format).toBe('execution')
    }
  })

  it('converts the known CAST row 04:12:51 ET → 08:12:51 UTC on 2026-06-15', () => {
    const cast = r.executions.find(
      (e) => e.symbol === 'CAST' && e.side === 'B' && e.qty === 353 && e.price === 3.45,
    )
    expect(cast).toBeDefined()
    expect(cast!.time).toBe('2026-06-15T08:12:51Z')
    expect(cast!.date).toBe('2026-06-15')
  })
})

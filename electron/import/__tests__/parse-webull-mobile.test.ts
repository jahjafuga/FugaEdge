import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseWebullMobileCsv,
  parseWebullPrice,
  normalizeWebullSide,
  parseWebullMobileTimestamp,
} from '../parse-webull-mobile'
import { detectFormat } from '../detect-format'

// Synthetic CSV — generic tickers, no identifying account or PII.
const SAMPLE_HEADER =
  'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time'

const SAMPLE = [
  SAMPLE_HEADER,
  'Acme Corp,ACME,Buy,Filled,100,100,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
  'Acme Corp,ACME,Sell,Filled,50,50,@10.5000000000,10.5000000000,GTC,05/14/2026 06:55:00 EDT,05/14/2026 06:55:00 EDT',
  'Acme Corp,ACME,Sell,Filled,50,50,@10.7500000000,10.7500000000,GTC,05/14/2026 06:56:00 EDT,05/14/2026 06:56:00 EDT',
].join('\n')

describe('parseWebullMobileCsv — happy path', () => {
  it('parses each row into an Execution', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    expect(r.skipped).toBe(0)
    expect(r.executions).toHaveLength(3)
    expect(r.executions[0].symbol).toBe('ACME')
    expect(r.executions[0].side).toBe('B')
    expect(r.executions[0].qty).toBe(100)
    expect(r.executions[0].price).toBe(10)
    // 06:54:05 EDT (literal in the source) → 10:54:05 UTC. `date` stays Eastern.
    expect(r.executions[0].time).toBe('2026-05-14T10:54:05Z')
    expect(r.executions[0].date).toBe('2026-05-14')
  })

  it('marks source_broker=Webull and source_format=orders', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (const e of r.executions) {
      expect(e.source_broker).toBe('Webull')
      expect(e.source_format).toBe('orders')
    }
  })

  it('propagates source_file when filename is passed', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (const e of r.executions) {
      expect(e.source_file).toBe('webull-mobile.csv')
    }
  })

  it('synthesizes wbm-prefixed IDs in the expected shape', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^wbm-[0-9a-f]{12}$/)
      // No source order ID → trade_id and order_id collapse.
      expect(e.order_id).toBe(e.trade_id)
    }
  })

  it('produces stable synthetic IDs across re-parses (dedup contract)', () => {
    const a = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    const b = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (let i = 0; i < a.executions.length; i++) {
      expect(a.executions[i].trade_id).toBe(b.executions[i].trade_id)
    }
  })

  it('does not set is_paper at the parser level (Track C UI overlays it)', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (const e of r.executions) {
      expect(e.is_paper).toBeUndefined()
    }
  })

  it('strips a BOM at the start of the file', () => {
    const r = parseWebullMobileCsv('﻿' + SAMPLE, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(3)
  })

  it('is_short defaults to false on parser output (shorts inferred by buildRoundTrips)', () => {
    const r = parseWebullMobileCsv(SAMPLE, 'webull-mobile.csv')
    for (const e of r.executions) {
      expect(e.is_short).toBe(false)
    }
  })
})

describe('parseWebullMobileCsv — bad-row handling', () => {
  it('skips rows with empty symbol', () => {
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,,Buy,Filled,100,100,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0]).toMatchObject({ outcome: 'skipped', reason: 'empty-symbol' })
  })

  it('skips rows whose Status is not Filled (Cancelled, etc.)', () => {
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,ACME,Buy,Cancelled,0,100,@10.0000000000,0,DAY,05/14/2026 06:54:05 EDT,',
      'Acme Corp,ACME,Buy,Partial Filled,50,100,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(2)
    expect(r.trace.every((t) => t.outcome === 'skipped' && t.reason?.startsWith('status:'))).toBe(
      true,
    )
  })

  it('skips rows with invalid Side', () => {
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,ACME,Hold,Filled,100,100,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toMatch(/^bad-side:/)
  })

  it('skips rows with zero qty', () => {
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,ACME,Buy,Filled,0,0,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toBe('zero-qty')
  })

  it('skips rows with malformed timestamp', () => {
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,ACME,Buy,Filled,100,100,@10.0000000000,10.0000000000,DAY,not-a-time,also-bad',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.trace[0].reason).toMatch(/^bad-time:/)
  })

  it('tolerates a missing @ prefix on the Price column (Avg Price is authoritative anyway)', () => {
    // Defensive: a future Webull mobile change that drops the '@' shouldn't
    // break parsing. We pull qty/price from Filled/Avg Price, which already
    // lacks the '@' — so this row should still parse cleanly.
    const csv = [
      SAMPLE_HEADER,
      'Acme Corp,ACME,Buy,Filled,100,100,10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
    ].join('\n')
    const r = parseWebullMobileCsv(csv, 'webull-mobile.csv')
    expect(r.executions).toHaveLength(1)
    expect(r.executions[0].price).toBe(10)
  })
})

describe('parseWebullMobileCsv — synthetic ID stability', () => {
  it('same row tuple → same ID', () => {
    const a = parseWebullMobileCsv(SAMPLE)
    const b = parseWebullMobileCsv(SAMPLE)
    expect(a.executions[0].trade_id).toBe(b.executions[0].trade_id)
  })

  it('changing the qty produces a different ID', () => {
    const base = parseWebullMobileCsv(SAMPLE)
    const modified = parseWebullMobileCsv(
      [
        SAMPLE_HEADER,
        'Acme Corp,ACME,Buy,Filled,99,99,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
      ].join('\n'),
    )
    expect(modified.executions[0].trade_id).not.toBe(base.executions[0].trade_id)
  })

  it('changing the price produces a different ID', () => {
    const base = parseWebullMobileCsv(SAMPLE)
    const modified = parseWebullMobileCsv(
      [
        SAMPLE_HEADER,
        'Acme Corp,ACME,Buy,Filled,100,100,@10.0100000000,10.0100000000,DAY,05/14/2026 06:54:05 EDT,05/14/2026 06:54:05 EDT',
      ].join('\n'),
    )
    expect(modified.executions[0].trade_id).not.toBe(base.executions[0].trade_id)
  })

  it('changing the time produces a different ID', () => {
    const base = parseWebullMobileCsv(SAMPLE)
    const modified = parseWebullMobileCsv(
      [
        SAMPLE_HEADER,
        'Acme Corp,ACME,Buy,Filled,100,100,@10.0000000000,10.0000000000,DAY,05/14/2026 06:54:06 EDT,05/14/2026 06:54:06 EDT',
      ].join('\n'),
    )
    expect(modified.executions[0].trade_id).not.toBe(base.executions[0].trade_id)
  })
})

describe('parseWebullPrice', () => {
  it('strips the @ prefix and parses the float', () => {
    expect(parseWebullPrice('@4.7700000000')).toBe(4.77)
  })

  it('parses a plain decimal without the @ prefix', () => {
    expect(parseWebullPrice('4.7700000000')).toBe(4.77)
  })

  it('returns 0 on empty / whitespace', () => {
    expect(parseWebullPrice('')).toBe(0)
    expect(parseWebullPrice('   ')).toBe(0)
  })

  it('returns 0 on non-numeric garbage', () => {
    expect(parseWebullPrice('@not-a-price')).toBe(0)
    expect(parseWebullPrice('--')).toBe(0)
  })
})

describe('normalizeWebullSide', () => {
  it('maps Buy → B (title case)', () => {
    expect(normalizeWebullSide('Buy')).toBe('B')
  })

  it('maps Sell → S (title case)', () => {
    expect(normalizeWebullSide('Sell')).toBe('S')
  })

  it('is case-insensitive', () => {
    expect(normalizeWebullSide('BUY')).toBe('B')
    expect(normalizeWebullSide('sell')).toBe('S')
    expect(normalizeWebullSide('  Sell  ')).toBe('S')
  })

  it('returns null on anything else', () => {
    expect(normalizeWebullSide('Hold')).toBeNull()
    expect(normalizeWebullSide('B')).toBeNull() // raw DAS code is NOT a valid Webull side
    expect(normalizeWebullSide('')).toBeNull()
  })
})

describe('parseWebullMobileTimestamp', () => {
  it('parses an EDT timestamp into bare local Eastern ISO', () => {
    const r = parseWebullMobileTimestamp('05/14/2026 06:54:05 EDT')
    expect(r).toEqual({ date: '2026-05-14', time: '2026-05-14T06:54:05', tz: 'EDT' })
  })

  it('parses an EST timestamp the same way (TZ literal tagged but not applied)', () => {
    const r = parseWebullMobileTimestamp('12/15/2026 09:30:00 EST')
    expect(r).toEqual({ date: '2026-12-15', time: '2026-12-15T09:30:00', tz: 'EST' })
  })

  it('zero-pads single-digit month, day, and hour', () => {
    const r = parseWebullMobileTimestamp('1/2/2026 3:04:05 EDT')
    expect(r).toEqual({ date: '2026-01-02', time: '2026-01-02T03:04:05', tz: 'EDT' })
  })

  it('returns null on a missing TZ literal', () => {
    expect(parseWebullMobileTimestamp('05/14/2026 06:54:05')).toBeNull()
  })

  it('returns null on an unsupported TZ literal', () => {
    expect(parseWebullMobileTimestamp('05/14/2026 06:54:05 PDT')).toBeNull()
    expect(parseWebullMobileTimestamp('05/14/2026 06:54:05 UTC')).toBeNull()
  })

  it('returns null on a malformed date', () => {
    expect(parseWebullMobileTimestamp('13/45/2026 06:54:05 EDT')).toBeNull()
    expect(parseWebullMobileTimestamp('not/a/date 06:54:05 EDT')).toBeNull()
  })

  it('returns null on a malformed time', () => {
    expect(parseWebullMobileTimestamp('05/14/2026 25:99:99 EDT')).toBeNull()
    expect(parseWebullMobileTimestamp('05/14/2026 6:54 EDT')).toBeNull()
  })

  it('returns null on empty / whitespace', () => {
    expect(parseWebullMobileTimestamp('')).toBeNull()
    expect(parseWebullMobileTimestamp('   ')).toBeNull()
  })
})

describe('detectFormat routing — webull_mobile', () => {
  it('routes the Webull Mobile header to "webull_mobile"', () => {
    expect(detectFormat(SAMPLE)).toBe('webull_mobile')
  })

  it('strips a BOM before sniffing', () => {
    expect(detectFormat('﻿' + SAMPLE)).toBe('webull_mobile')
  })

  it('does not collide with any of the DAS shapes', () => {
    // executions: first column TradeID
    expect(
      detectFormat('TradeID,OrderID,B/S,Symbol,Qty,Price,Time\n1,A1,B,X,100,10,09:30'),
    ).toBe('executions')
    // tradehistory: first column Date + matching columns
    expect(
      detectFormat('Date,Time,Symbol,Side,Quantity,Price,P&L\n05/14/26,09:30:00,X,B,100,10,0'),
    ).toBe('tradehistory')
    // trades_window: first column Time + Cloid
    expect(
      detectFormat(
        'Time,Symbol,Side,Price,Qty,Route,LiqType,Broker,Account,Type,Cloid\n09:30:00,X,B,10,100,ARCA,RR,ARCX,A,Margin,C1',
      ),
    ).toBe('trades_window')
    // daily-summary: first column Symbol with fee markers
    expect(detectFormat('Symbol,ECN,FINRA,HTB\nXYZ,1.00,0.10,0.50')).toBe('daily-summary')
  })

  it('returns "unknown" for a Name-led header missing the distinctive Webull columns', () => {
    // A hypothetical other-broker "Name"-first header without
    // "Filled Time" / "Time-in-Force" should NOT be misrouted.
    expect(detectFormat('Name,Symbol,Price\nFoo,ABC,10')).toBe('unknown')
  })

  it('returns "unknown" on Name-led header with only one of the two Webull markers', () => {
    // Has Filled Time but no Time-in-Force.
    expect(detectFormat('Name,Symbol,Filled Time\nFoo,ABC,2026-05-14')).toBe('unknown')
    // Has Time-in-Force but no Filled Time.
    expect(detectFormat('Name,Symbol,Time-in-Force\nFoo,ABC,DAY')).toBe('unknown')
  })

  it('header check is case-insensitive', () => {
    const upperHeader = SAMPLE_HEADER.toUpperCase()
    const sampleUpper = [upperHeader, ...SAMPLE.split('\n').slice(1)].join('\n')
    expect(detectFormat(sampleUpper)).toBe('webull_mobile')
  })
})

// Generic real-fixture invariants — NO identifying strings asserted.
// Skipped automatically when the fixture isn't present (CI / fresh clone).
const WEBULL_MOBILE_FIXTURE = resolve(
  __dirname,
  '../../../test-fixtures/webull-mobile-cash-2026-04-16-to-05-14.csv',
)

describe('Webull mobile real fixture — generic invariants only', () => {
  if (!existsSync(WEBULL_MOBILE_FIXTURE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }

  const csv = readFileSync(WEBULL_MOBILE_FIXTURE, 'utf8')
  const r = parseWebullMobileCsv(csv, 'webull-mobile-cash-2026-04-16-to-05-14.csv')

  it('parses all 25 rows as executions with zero skipped', () => {
    expect(r.executions).toHaveLength(25)
    expect(r.skipped).toBe(0)
  })

  it('every row tags source_broker=Webull and source_format=orders', () => {
    for (const e of r.executions) {
      expect(e.source_broker).toBe('Webull')
      expect(e.source_format).toBe('orders')
    }
  })

  it('every side is B or S', () => {
    for (const e of r.executions) {
      expect(['B', 'S']).toContain(e.side)
    }
  })

  it('every qty and price is strictly positive', () => {
    for (const e of r.executions) {
      expect(e.qty).toBeGreaterThan(0)
      expect(e.price).toBeGreaterThan(0)
    }
  })

  it('every synthetic ID matches /^wbm-[0-9a-f]{12}$/', () => {
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^wbm-[0-9a-f]{12}$/)
      expect(e.order_id).toBe(e.trade_id)
    }
  })

  it('every symbol is a short uppercase ticker (1-5 letters)', () => {
    for (const e of r.executions) {
      expect(e.symbol).toMatch(/^[A-Z]{1,5}$/)
    }
  })

  it('every date falls inside 2026-04-16 → 2026-05-14', () => {
    for (const e of r.executions) {
      expect(e.date >= '2026-04-16' && e.date <= '2026-05-14').toBe(true)
    }
  })

  it('synthetic IDs are unique across the file', () => {
    const ids = new Set(r.executions.map((e) => e.trade_id))
    expect(ids.size).toBe(r.executions.length)
  })

  it('is_paper is unset on every parsed row (parser-level invariant)', () => {
    for (const e of r.executions) {
      expect(e.is_paper).toBeUndefined()
    }
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseToSActivityCsv,
  parseToSStatementCsv,
  parseToSTime,
  deriveToSDirection,
} from '../parse-tos'
import { detectFormat } from '../detect-format'
import { buildRoundTrips } from '@/core/import/build-round-trips'

// ── Trade Activity (flat CSV) synthetic builders ────────────────────────────
const ACT_HEADER =
  'Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Price Improvement,Order Type'

interface ActOpts {
  execTime?: string
  spread?: string
  side?: string
  qty?: string
  posEffect?: string
  symbol?: string
  exp?: string
  strike?: string
  type?: string
  price?: string
}
function actRow(o: ActOpts = {}): string {
  const qty = o.qty ?? '100'
  const side = o.side ?? (qty.startsWith('-') ? 'SELL' : 'BUY')
  const price = o.price ?? '10.00'
  return [
    o.execTime ?? '5/18/2026 7:30',
    o.spread ?? 'STOCK',
    side,
    qty,
    o.posEffect ?? 'TO OPEN',
    o.symbol ?? 'TEST',
    o.exp ?? '',
    o.strike ?? '',
    o.type ?? 'STOCK',
    price,
    price, // Net Price = Price for stocks
    '-', // Price Improvement
    'LMT',
  ].join(',')
}
const actCsv = (...rows: string[]): string => [ACT_HEADER, ...rows].join('\n')

// ── Account Statement (section-formatted, leading blank column) builders ─────
const STMT_HEADER =
  ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type'
function stmtRow(o: ActOpts = {}): string {
  const qty = o.qty ?? '100'
  const side = o.side ?? (qty.startsWith('-') ? 'SELL' : 'BUY')
  const price = o.price ?? '10.00'
  return [
    '', // leading blank column
    o.execTime ?? '5/13/2026 7:30',
    o.spread ?? 'STOCK',
    side,
    qty,
    o.posEffect ?? 'TO OPEN',
    o.symbol ?? 'TEST',
    o.exp ?? '',
    o.strike ?? '',
    o.type ?? 'STOCK',
    price,
    price,
    'LMT',
  ].join(',')
}
const stmtCsv = (...rows: string[]): string =>
  ['Account Trade History,,,,,,,,,,,,', STMT_HEADER, ...rows].join('\n')

// ═══════════════════════════════════════════════════════════════════════════

describe('deriveToSDirection — Pos Effect × Side (RED#2)', () => {
  it('maps all four combos to the correct trade direction', () => {
    expect(deriveToSDirection('B', 'TO OPEN')).toBe('long') // open a long
    expect(deriveToSDirection('S', 'TO CLOSE')).toBe('long') // close a long
    expect(deriveToSDirection('S', 'TO OPEN')).toBe('short') // open a short
    expect(deriveToSDirection('B', 'TO CLOSE')).toBe('short') // cover a short
  })
})

describe('parseToSTime + DST (RED#4)', () => {
  it('parses "M/D/YYYY H:MM" to padded Eastern date + time', () => {
    expect(parseToSTime('5/13/2026 8:53')).toEqual({ date: '2026-05-13', time: '08:53:00' })
    expect(parseToSTime('5/18/2026 7:07')).toEqual({ date: '2026-05-18', time: '07:07:00' })
  })
  it('returns null on malformed input', () => {
    expect(parseToSTime('2026-05-13 8:53')).toBeNull()
    expect(parseToSTime('')).toBeNull()
  })
  it('converts EDT wall-clock to UTC (May → UTC-4)', () => {
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ execTime: '5/13/2026 8:53', symbol: 'AEHL' }),
        actRow({ execTime: '5/18/2026 7:07', symbol: 'SBFM' }),
      ),
    )
    expect(r.executions[0].time).toBe('2026-05-13T12:53:00Z') // 8:53 + 4
    expect(r.executions[0].date).toBe('2026-05-13')
    expect(r.executions[1].time).toBe('2026-05-18T11:07:00Z') // 7:07 + 4
  })
})

describe('parseToSActivityCsv — happy path + mapping', () => {
  it('maps a buy and a sell into Executions', () => {
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'SBFM', qty: '500', posEffect: 'TO OPEN', price: '1.24' }),
        actRow({ symbol: 'SBFM', qty: '-100', posEffect: 'TO CLOSE', price: '1.26' }),
      ),
      'ta.csv',
    )
    expect(r.skipped).toBe(0)
    expect(r.executions).toHaveLength(2)
    const buy = r.executions.find((e) => e.side === 'B')!
    expect(buy.symbol).toBe('SBFM')
    expect(buy.qty).toBe(500)
    expect(buy.price).toBe(1.24)
    expect(buy.source_broker).toBe('ThinkorSwim')
    expect(buy.source_format).toBe('execution')
    expect(buy.source_file).toBe('ta.csv')
    expect(buy.is_paper).toBe(false)
    expect(buy.account_name).toBeUndefined() // never derived from filename
    const sell = r.executions.find((e) => e.side === 'S')!
    expect(sell.qty).toBe(100)
  })

  it('derives side from signed Qty and surfaces a Side-text disagreement', () => {
    const r = parseToSActivityCsv(actCsv(actRow({ side: 'SELL', qty: '100' })))
    expect(r.executions[0].side).toBe('B') // qty sign wins
    expect(r.warnings.join(' ').toLowerCase()).toContain('disagree')
  })
})

describe('option / non-STOCK filter (RED#5)', () => {
  it('skips an option row (Type≠STOCK or Exp/Strike populated), logged not silent', () => {
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'SPY', type: 'CALL', exp: '6/20/2026', strike: '500' }),
        actRow({ symbol: 'SBFM', type: 'STOCK' }),
      ),
    )
    expect(r.executions).toHaveLength(1)
    expect(r.executions[0].symbol).toBe('SBFM')
    const skip = r.trace.find((t) => t.outcome === 'skipped')
    expect(skip).toBeDefined()
    expect((skip!.reason ?? '').toLowerCase()).toMatch(/option|stock/)
  })
})

describe('no fees → fees_reported false, never a fake $0 (RED#6)', () => {
  it('built trip has total_fees 0, fees_reported false, net == gross', () => {
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'OCG', qty: '100', posEffect: 'TO OPEN', price: '2.50' }),
        actRow({ symbol: 'OCG', qty: '-100', posEffect: 'TO CLOSE', price: '2.67' }),
      ),
    )
    expect(r.executions[0].commission).toBeUndefined() // not the number 0
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].total_fees).toBe(0)
    expect(trips[0].fees_reported).toBe(false)
    expect(trips[0].net_pnl).toBe(trips[0].gross_pnl)
  })
})

describe('synthetic IDs (RED#7)', () => {
  it('synthesizes a unique tos- id per fill; trade_id === order_id', () => {
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'A', qty: '100', price: '1.0' }),
        actRow({ symbol: 'A', qty: '200', price: '1.0' }),
        actRow({ symbol: 'A', qty: '-300', price: '1.1' }),
      ),
    )
    for (const e of r.executions) {
      expect(e.trade_id).toMatch(/^tos-[0-9a-f]{12}$/)
      expect(e.order_id).toBe(e.trade_id)
    }
    expect(new Set(r.executions.map((e) => e.trade_id)).size).toBe(3)
  })
})

describe('RISK#1 within-minute ordering (RED#1)', () => {
  it('long cluster with SELL TO CLOSE before BUY TO OPEN same minute → ONE LONG trip', () => {
    // SBFM 7:07 shape: file lists the close-side sell first, then the opening buys.
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'SBFM', qty: '-100', posEffect: 'TO CLOSE', price: '1.26', execTime: '5/18/2026 7:07' }),
        actRow({ symbol: 'SBFM', qty: '500', posEffect: 'TO OPEN', price: '1.2395', execTime: '5/18/2026 7:07' }),
        actRow({ symbol: 'SBFM', qty: '-400', posEffect: 'TO CLOSE', price: '1.30', execTime: '5/18/2026 7:08' }),
      ),
    )
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('long') // NOT short
  })
})

describe('synthetic SHORT by construction (RED#3)', () => {
  it('SELL TO OPEN then BUY TO CLOSE builds a SHORT trip (short-side ordering too)', () => {
    // Same minute, BUY-to-close listed first; short-direction ordering must lead with the sell.
    const r = parseToSActivityCsv(
      actCsv(
        actRow({ symbol: 'XYZ', qty: '100', side: 'BUY', posEffect: 'TO CLOSE', price: '9.00', execTime: '5/18/2026 7:30' }),
        actRow({ symbol: 'XYZ', qty: '-100', side: 'SELL', posEffect: 'TO OPEN', price: '10.00', execTime: '5/18/2026 7:30' }),
      ),
    )
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('short')
    expect(trips[0].gross_pnl).toBeCloseTo(100, 2) // sold 100@10 − bought 100@9
  })
})

describe('Account Statement section extraction (RED#10)', () => {
  it('parses ONLY the Account Trade History block; ignores a following section', () => {
    const csv = [
      'Account Trade History,,,,,,,,,,,,',
      STMT_HEADER,
      stmtRow({ symbol: 'AEHL', qty: '100', posEffect: 'TO OPEN', price: '3.00', execTime: '5/13/2026 8:49' }),
      stmtRow({ symbol: 'AEHL', qty: '-100', posEffect: 'TO CLOSE', price: '3.10', execTime: '5/13/2026 8:53' }),
      'Cash Balance,,,,,,,,,,,,',
      ',Date,Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance,,,',
      ',5/13/2026,,DEPOSIT,,,Wire,0,1000,1000,,,',
    ].join('\n')
    const r = parseToSStatementCsv(csv, 'stmt.csv')
    expect(r.executions).toHaveLength(2)
    expect(new Set(r.executions.map((e) => e.symbol))).toEqual(new Set(['AEHL']))
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('long')
  })
})

describe('detectFormat — ToS (RED#11)', () => {
  it('routes Trade Activity header → tos_activity (incl. BOM)', () => {
    expect(detectFormat(actCsv(actRow()))).toBe('tos_activity')
    expect(detectFormat('﻿' + actCsv(actRow()))).toBe('tos_activity')
  })
  it('routes Account Statement row1 → tos_statement (incl. BOM)', () => {
    expect(detectFormat(stmtCsv(stmtRow()))).toBe('tos_statement')
    expect(detectFormat('﻿' + stmtCsv(stmtRow()))).toBe('tos_statement')
  })
  it('does not misroute a non-ToS header, and does not collide with existing shapes', () => {
    expect(detectFormat('TradeID,OrderID,B/S,Symbol,Qty,Price,Time\n1,A1,B,X,100,10,09:30')).toBe(
      'executions',
    )
    expect(detectFormat('Foo,Bar,Baz\n1,2,3')).not.toBe('tos_activity')
    expect(detectFormat('Foo,Bar,Baz\n1,2,3')).not.toBe('tos_statement')
  })
})

// ── Real sanitized fixtures (gitignored; skipped where absent) ───────────────
const ACTIVITY = resolve(__dirname, '../../../test-fixtures/2026-05-18-TradeActivityJOHNTOS.csv')
const STATEMENT = resolve(__dirname, '../../../test-fixtures/2026-05-13-AccountStatementJOHNTOS.csv')

describe('ToS real fixture — Trade Activity SBFM (RED#8)', () => {
  if (!existsSync(ACTIVITY)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }
  const r = parseToSActivityCsv(readFileSync(ACTIVITY, 'utf8'), 'TradeActivity.csv')
  it('parses all fills with zero skipped', () => {
    expect(r.skipped).toBe(0)
    expect(r.executions.length).toBeGreaterThan(0)
  })
  it('builds 2 LONG trips, all flat-close, ZERO shorts', () => {
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(2)
    expect(trips.filter((t) => t.side === 'short')).toHaveLength(0)
    expect(trips.filter((t) => t.is_open)).toHaveLength(0)
    expect(trips.map((t) => t.shares_bought).sort((a, b) => a - b)).toEqual([500, 600])
  })
})

describe('ToS real fixture — Account Statement AEHL/OCG (RED#9)', () => {
  if (!existsSync(STATEMENT)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }
  const r = parseToSStatementCsv(readFileSync(STATEMENT, 'utf8'), 'AccountStatement.csv')
  it('parses the Account Trade History block with zero skipped', () => {
    expect(r.skipped).toBe(0)
    expect(r.executions.length).toBeGreaterThan(0)
  })
  it('AEHL → 1 LONG (300 sh); OCG → 2 LONG; all flat-close', () => {
    const trips = buildRoundTrips(r.executions)
    expect(trips.filter((t) => t.is_open)).toHaveLength(0)
    expect(trips.filter((t) => t.side === 'short')).toHaveLength(0)
    const aehl = trips.filter((t) => t.symbol === 'AEHL')
    expect(aehl).toHaveLength(1)
    expect(aehl[0].side).toBe('long')
    expect(aehl[0].shares_bought).toBe(300)
    const ocg = trips.filter((t) => t.symbol === 'OCG')
    expect(ocg).toHaveLength(2)
    expect(ocg.every((t) => t.side === 'long')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseLightspeedCsv, parseLightspeedExecTime } from '../parse-lightspeed'
import { detectFormat } from '../detect-format'
import { buildRoundTrips } from '@/core/import/build-round-trips'

// The 46-column Lightspeed blotter header, exact order. Decoupled from the
// gitignored fixtures so detection/parse stay pinned even if a fixture changes.
const HEADER =
  'Account Number,Account Type,Side,Symbol,CUSIP,Currency Code,Security Type,' +
  'Buy/Sell,Trade Date,Settlement Date,Process Date,Price,Qty,Trade Number,' +
  'Principal Amount,NET Amount,Commission Amount,Execution Time,Raw Exec. Time,' +
  'Market Code,Trailer,FeeSEC,FeeMF,Fee1,Fee2,Fee3,FeeStamp,FeeTAF,Fee4,' +
  'Sequence Number,Side Seq Code,Capacity Code,Office Code,Rep Code,Special Code,' +
  'Instructions Trade Legend Code,Factor Type2,Trade Interest,Original TradeNumber,' +
  'Entry Time,Entered By,YieldToMature,YieldToCall,Mutual Fund Sales Charge Rate,' +
  'Mutual Fund Load Indicator,Transtype'

// A real quoted header line from Brendan's fixture (quoted dialect) — frozen so
// detection is asserted against the genuine on-disk shape, not just our synthetic.
const QUOTED_HEADER =
  '"Account Number","Account Type","Side","Symbol","CUSIP","Currency Code",' +
  '"Security Type","Buy/Sell","Trade Date","Settlement Date","Process Date",' +
  '"Price","Qty","Trade Number","Principal Amount","NET Amount","Commission Amount",' +
  '"Execution Time","Raw Exec. Time","Market Code","Trailer","FeeSEC","FeeMF",' +
  '"Fee1","Fee2","Fee3","FeeStamp","FeeTAF","Fee4","Sequence Number"'

interface RowOpts {
  account?: string
  side?: string
  symbol?: string
  buySell?: string
  tradeDate?: string
  price?: string
  qty?: string
  tradeNumber?: string
  commission?: string
  rawExecTime?: string
  feeSec?: string
  feeMf?: string
  fee1?: string
  fee2?: string
  fee3?: string
  feeStamp?: string
  feeTaf?: string
  fee4?: string
}

let tnSeq = 0
function lsRow(o: RowOpts = {}): string {
  tnSeq += 1
  const cols = new Array(46).fill('')
  cols[0] = o.account ?? 'ACCT1'
  cols[1] = '1'
  cols[2] = o.side ?? (o.qty && o.qty.startsWith('-') ? 'S' : 'B')
  cols[3] = o.symbol ?? 'TEST'
  cols[7] = o.buySell ?? 'Long Buy'
  cols[8] = o.tradeDate ?? '01/05/2026'
  cols[11] = o.price ?? '10.00'
  cols[12] = o.qty ?? '100'
  cols[13] = o.tradeNumber ?? `TN${tnSeq}`
  cols[16] = o.commission ?? '0'
  cols[18] = o.rawExecTime ?? '01/05/2026 09:30:00'
  cols[21] = o.feeSec ?? '0'
  cols[22] = o.feeMf ?? '0'
  cols[23] = o.fee1 ?? '0'
  cols[24] = o.fee2 ?? '0'
  cols[25] = o.fee3 ?? '0'
  cols[26] = o.feeStamp ?? '0'
  cols[27] = o.feeTaf ?? '0'
  cols[28] = o.fee4 ?? '0'
  cols[45] = 'Trade'
  return cols.join(',')
}
const csv = (...rows: string[]): string => [HEADER, ...rows].join('\n')

describe('parseLightspeedCsv — happy path', () => {
  it('parses a buy and a sell into Executions with the mapped fields', () => {
    const r = parseLightspeedCsv(
      csv(
        lsRow({ symbol: 'MNTS', qty: '250', price: '8.80', tradeNumber: 'NbGsV', rawExecTime: '01/05/2026 09:11:00', buySell: 'Long Buy', account: '2LD11930' }),
        lsRow({ symbol: 'MNTS', qty: '-125', price: '8.83', tradeNumber: 'NbGsS', rawExecTime: '01/05/2026 09:12:00', buySell: 'Long Sell', account: '2LD11930' }),
      ),
      'ls.csv',
    )
    expect(r.skipped).toBe(0)
    expect(r.executions).toHaveLength(2)

    const buy = r.executions.find((e) => e.side === 'B')!
    expect(buy.symbol).toBe('MNTS')
    expect(buy.qty).toBe(250)
    expect(buy.price).toBe(8.8)
    expect(buy.trade_id).toBe('NbGsV')
    expect(buy.order_id).toBe('NbGsV') // type requires order_id → reuse Trade Number
    expect(buy.account_name).toBe('2LD11930')
    expect(buy.date).toBe('2026-01-05')
    expect(buy.time).toBe('2026-01-05T14:11:00Z') // 09:11 ET (Jan/EST, UTC-5)
    expect(buy.is_paper).toBe(false)

    const sell = r.executions.find((e) => e.side === 'S')!
    expect(sell.qty).toBe(125)
    expect(sell.price).toBe(8.83)
  })

  it('derives side from the SIGNED Qty (+ → B, − → S) and stores abs qty', () => {
    const r = parseLightspeedCsv(
      csv(lsRow({ qty: '250', side: 'B' }), lsRow({ qty: '-125', side: 'S' })),
    )
    expect(r.executions[0].side).toBe('B')
    expect(r.executions[0].qty).toBe(250)
    expect(r.executions[1].side).toBe('S')
    expect(r.executions[1].qty).toBe(125)
  })

  it('tags source_broker=Lightspeed / source_format=execution / source_file', () => {
    const r = parseLightspeedCsv(csv(lsRow()), 'blotter.csv')
    expect(r.executions[0].source_broker).toBe('Lightspeed')
    expect(r.executions[0].source_format).toBe('execution')
    expect(r.executions[0].source_file).toBe('blotter.csv')
  })

  it('surfaces a warning when the Side column disagrees with the Qty sign', () => {
    // Side says S but Qty is +100 — shouldn't happen; must be surfaced.
    const r = parseLightspeedCsv(csv(lsRow({ side: 'S', qty: '100' })))
    expect(r.executions).toHaveLength(1)
    expect(r.executions[0].side).toBe('B') // qty sign wins
    expect(r.warnings.join(' ').toLowerCase()).toContain('disagree')
  })
})

describe('parseLightspeedCsv — decimals (RED#5 numerics)', () => {
  it('parses leading-dot and zero-padded decimals', () => {
    const r = parseLightspeedCsv(
      csv(
        lsRow({ price: '.2500', commission: '.0400000000', qty: '100' }),
        lsRow({ price: '10.7500', qty: '-100' }),
      ),
    )
    expect(r.executions[0].price).toBeCloseTo(0.25, 4)
    expect(r.executions[0].commission).toBeCloseTo(0.04, 4)
    expect(r.executions[1].price).toBeCloseTo(10.75, 4)
  })
})

describe('parseLightspeedCsv — fee mapping (RED#7, sign-preserving)', () => {
  it('maps Commission/FeeSEC/FeeTAF and folds the numbered fees into other_fees', () => {
    const r = parseLightspeedCsv(
      csv(lsRow({ commission: '0.25', feeSec: '0.04', feeTaf: '0.02', fee2: '0.29', qty: '-100' })),
    )
    const e = r.executions[0]
    expect(e.commission).toBeCloseTo(0.25, 2)
    expect(e.sec_fee).toBeCloseTo(0.04, 2)
    expect(e.finra_fee).toBeCloseTo(0.02, 2) // FeeTAF → finra_fee
    expect(e.other_fees).toBeCloseTo(0.29, 2) // FeeMF+Fee1..4+FeeStamp
    expect(e.ecn_fee).toBeUndefined()
    expect(e.cat_fee).toBeUndefined()
    expect(e.htb_fee).toBeUndefined()
    // total_fees on the built round trip = the sum.
    const trips = buildRoundTrips([
      ...parseLightspeedCsv(csv(lsRow({ qty: '100', price: '5', symbol: 'AAA' }))).executions,
      ...r.executions.map((x) => ({ ...x, symbol: 'AAA', price: 6 })),
    ])
    expect(trips[0].total_fees).toBeCloseTo(0.6, 2)
  })
})

describe('parseLightspeedExecTime', () => {
  it('splits "MM/DD/YYYY HH:MM:SS" into Eastern date + time', () => {
    expect(parseLightspeedExecTime('01/05/2026 09:11:00')).toEqual({
      date: '2026-01-05',
      time: '09:11:00',
    })
  })
  it('returns null on malformed input', () => {
    expect(parseLightspeedExecTime('2026-01-05 09:11')).toBeNull()
    expect(parseLightspeedExecTime('')).toBeNull()
  })
})

describe('parseLightspeedCsv — DST (RED#6)', () => {
  it('Jan fill is EST (UTC-5); April fill is EDT (UTC-4)', () => {
    const r = parseLightspeedCsv(
      csv(
        lsRow({ rawExecTime: '01/05/2026 09:11:00', symbol: 'MNTS', qty: '250' }),
        lsRow({ rawExecTime: '04/20/2026 07:28:00', symbol: 'SPRC', qty: '32' }),
      ),
    )
    expect(r.executions[0].time).toBe('2026-01-05T14:11:00Z')
    expect(r.executions[1].time).toBe('2026-04-20T11:28:00Z')
  })
})

describe('parseLightspeedCsv — bad rows', () => {
  const reasonOf = (row: string): string | undefined =>
    parseLightspeedCsv(csv(row)).trace.find((t) => t.outcome === 'skipped')?.reason
  it('skips empty symbol / zero qty / bad time', () => {
    expect(reasonOf(lsRow({ symbol: '' }))).toBe('empty-symbol')
    expect(reasonOf(lsRow({ qty: '0' }))).toBe('zero-qty')
    expect(reasonOf(lsRow({ rawExecTime: 'nonsense' }))).toContain('bad-time')
  })
})

describe('parseLightspeedCsv — within-minute ordering wired in (RED#1 at parser level)', () => {
  it('a long listed Sell-before-Buy in one minute builds ONE LONG trip', () => {
    const r = parseLightspeedCsv(
      csv(
        lsRow({ symbol: 'XAIR', qty: '-181', price: '2.00', buySell: 'Long Sell', rawExecTime: '01/13/2026 07:36:00' }),
        lsRow({ symbol: 'XAIR', qty: '181', price: '1.00', buySell: 'Long Buy', rawExecTime: '01/13/2026 07:36:00' }),
      ),
    )
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('long')
    expect(trips[0].shares_bought).toBe(181)
  })
})

describe('detectFormat — lightspeed (RED#8)', () => {
  it('routes the unquoted Lightspeed header to "lightspeed"', () => {
    expect(detectFormat(csv(lsRow()))).toBe('lightspeed')
  })
  it('routes the real quoted Lightspeed header to "lightspeed"', () => {
    const quotedRow =
      '"1LD65063","1","B","EVOK","30049G302","USD","equity","Long Buy",' +
      '"10/28/2024","10/29/2024","10/28/2024","10.7500","100","Nd41n","1075.0000",' +
      '"1075.2500",".2500","07:14","10/28/2024 07:14:00","N","52881085"'
    expect(detectFormat(`${QUOTED_HEADER}\n${quotedRow}`)).toBe('lightspeed')
  })
  it('does not collide with TradeZero (exact "account") or other shapes', () => {
    expect(
      detectFormat(
        'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note\nA,06/15/2026,06/17/2026,USD,Limit,B,X,1,1,09:30:00,0,0,0,0,0,0,0,1,1,DTCC,Add,',
      ),
    ).toBe('tradezero')
    expect(detectFormat('TradeID,OrderID,B/S,Symbol,Qty,Price,Time\n1,A1,B,X,100,10,09:30')).toBe(
      'executions',
    )
  })
  it('an Account-Number-led header missing CUSIP/Trade Number is not lightspeed', () => {
    expect(detectFormat('Account Number,Symbol,Price\nA,ABC,10')).not.toBe('lightspeed')
  })
})

// ── Real sanitized fixtures — gitignored, skipped where absent ───────────────
const BRENDAN = resolve(__dirname, '../../../test-fixtures/Lightspeedbrendanblotterfile.csv')
const DAVE = resolve(__dirname, '../../../test-fixtures/Lightspeeddaveblotterfile.csv')

describe('Lightspeed real fixture — Brendan (quoted, LF, leading-dot)', () => {
  if (!existsSync(BRENDAN)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }
  const r = parseLightspeedCsv(readFileSync(BRENDAN, 'utf8'), 'Lightspeedbrendanblotterfile.csv')

  it('parses both fills with zero skipped', () => {
    expect(r.executions).toHaveLength(2)
    expect(r.skipped).toBe(0)
  })
  it('reads leading-dot fees and zero-padded prices correctly', () => {
    const buy = r.executions.find((e) => e.side === 'B')!
    const sell = r.executions.find((e) => e.side === 'S')!
    expect(buy.symbol).toBe('EVOK')
    expect(buy.price).toBeCloseTo(10.75, 2)
    expect(buy.time).toBe('2024-10-28T11:14:00Z') // Oct → EDT, 07:14 + 4
    expect(sell.price).toBeCloseTo(10.882, 3)
    expect(sell.sec_fee).toBeCloseTo(0.04, 2) // ".0400000000"
    expect(sell.finra_fee).toBeCloseTo(0.02, 2) // FeeTAF ".0200000000"
    expect(sell.other_fees).toBeCloseTo(0.29, 2) // Fee2 ".2900000000"
  })
  it('builds one LONG round trip', () => {
    const trips = buildRoundTrips(r.executions)
    expect(trips).toHaveLength(1)
    expect(trips[0].side).toBe('long')
    expect(trips[0].gross_pnl).toBeCloseTo(13.2, 2)
    expect(trips[0].total_fees).toBeCloseTo(0.85, 2)
  })
})

describe('Lightspeed real fixture — Dave (unquoted, CRLF, 838 fills)', () => {
  if (!existsSync(DAVE)) {
    it.skip('skipped: fixture not present', () => {})
    return
  }
  const r = parseLightspeedCsv(readFileSync(DAVE, 'utf8'), 'Lightspeeddaveblotterfile.csv')

  it('parses all 838 fills with zero skipped (RED#9)', () => {
    expect(r.executions).toHaveLength(838)
    expect(r.skipped).toBe(0)
  })
  it('builds round trips that ALL flat-close with ZERO short trips (RED#9)', () => {
    const trips = buildRoundTrips(r.executions)
    expect(trips.length).toBeGreaterThan(0)
    expect(trips.filter((t) => t.side === 'short')).toHaveLength(0)
    expect(trips.filter((t) => t.is_open)).toHaveLength(0)
  })
  it('converts a Jan fill via EST and an April fill via EDT (RED#6)', () => {
    const jan = r.executions.find(
      (e) => e.symbol === 'MNTS' && e.side === 'B' && e.qty === 250 && e.date === '2026-01-05',
    )
    const apr = r.executions.find(
      (e) => e.symbol === 'SPRC' && e.side === 'B' && e.qty === 32 && e.date === '2026-04-20',
    )
    expect(jan?.time).toBe('2026-01-05T14:11:00Z')
    expect(apr?.time).toBe('2026-04-20T11:28:00Z')
  })
})

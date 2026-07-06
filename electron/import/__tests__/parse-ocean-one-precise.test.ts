// Ocean One precise-column capture (Beat B2a). The parser reads the sheet at
// raw:false, so for the money columns it only ever sees the broker's 2dp
// DISPLAY (6.45 / 0.65) — the underlying 6.445 / 0.6465 never enters memory.
// B2a adds a parallel raw:true read so gross_pnl_precise / total_fees_precise
// carry the file's full-precision value (the source Beat B3 needs to sum
// without round-then-sum drift), while the 2dp gross_pnl / total_fees columns
// stay byte-identical to before.
//
// Harness note: broker money cells are NUMERIC with a 2dp number format. A
// synthetic {v:6.445, z:'0.00'} cell round-trips through XLSX.write(xls) as
// raw:true 6.445 / raw:false "6.45" (verified) — a plain string '6.445' cannot,
// since `raw` does not change string cells.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseOceanOneXls } from '../parse-ocean-one'

const HEADER = [
  'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
  'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
]
const GROSS_C = 8
const FEE_C = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] // Comm..Misc

interface Spec {
  time: string; sym: string; type: string; entry: number; exit: number
  qty: number; gross: number; comm?: number; net: number
}

// Build an Ocean One .xls where Gross + fee cells are NUMERIC and carry a 2dp
// display format, so raw:false yields the broker's rounded penny while raw:true
// exposes the underlying full-precision value.
function bufferOf(trades: Spec[]): Uint8Array {
  const aoa: unknown[][] = [['5/1/2026'], HEADER]
  for (const t of trades) {
    const r: unknown[] = new Array(21).fill(0)
    r[0] = `5/1/2026 ${t.time}`; r[1] = '9:59:00'; r[2] = '00:01:00'
    r[3] = t.sym; r[4] = t.type; r[5] = t.entry; r[6] = t.exit; r[7] = t.qty
    r[GROSS_C] = t.gross; r[9] = t.comm ?? 0; r[20] = t.net
    aoa.push(r)
  }
  aoa.push(['Equities', '', '', '', '', '', '', '', '0'], [])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  for (let row = 2; row < 2 + trades.length; row++) {
    for (const c of [GROSS_C, ...FEE_C]) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c })]
      if (cell && cell.t === 'n') cell.z = '0.00'
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}

interface PreciseTrip {
  symbol: string; gross_pnl: number; total_fees: number
  gross_pnl_precise: number; total_fees_precise: number
}
const trips = (r: { roundTrips: unknown[] }) => r.roundTrips as unknown as PreciseTrip[]
const bySym = (r: { roundTrips: unknown[] }, s: string) => trips(r).find((t) => t.symbol === s)!

describe('parseOceanOneXls — Beat B2a captures full-precision gross + fees', () => {
  it('LABT: gross_pnl_precise 6.445 / total_fees_precise 0.6465 while display stays 6.45 / 0.65', () => {
    const r = parseOceanOneXls(bufferOf([
      { time: '9:37:35', sym: 'LABT', type: 'Long', entry: 3.30, exit: 3.53, qty: 28, gross: 6.445, comm: 0.6465, net: 5.7985 },
    ]))
    const t = bySym(r, 'LABT')
    // 2dp display — must be byte-identical to pre-B2a behaviour
    expect(t.gross_pnl).toBeCloseTo(6.45, 2)
    expect(t.total_fees).toBeCloseTo(0.65, 2)
    // precise — the file's underlying value, NOT the rounded display
    expect(t.gross_pnl_precise).toBeCloseTo(6.445, 3)
    expect(t.total_fees_precise).toBeCloseTo(0.6465, 4)
    expect(t.gross_pnl_precise).not.toBe(t.gross_pnl)
    expect(t.total_fees_precise).not.toBe(t.total_fees)
  })

  it('precise sums diverge from 2dp sums across rows (precision captured, not a copy of the rounded number)', () => {
    const r = parseOceanOneXls(bufferOf([
      { time: '9:37:35', sym: 'AAA', type: 'Long', entry: 3.30, exit: 3.53, qty: 28, gross: 6.445, net: 6.445 },
      { time: '9:38:35', sym: 'BBB', type: 'Long', entry: 3.30, exit: 3.53, qty: 28, gross: 6.445, net: 6.445 },
      { time: '9:39:35', sym: 'CCC', type: 'Long', entry: 3.30, exit: 3.53, qty: 28, gross: 6.445, net: 6.445 },
    ]))
    const all = trips(r)
    const sumDisplay = all.reduce((a, t) => a + t.gross_pnl, 0) // 3 * 6.45  = 19.35
    const sumPrecise = all.reduce((a, t) => a + t.gross_pnl_precise, 0) // 3 * 6.445 = 19.335
    expect(sumDisplay).toBeCloseTo(19.35, 2)
    expect(sumPrecise).toBeCloseTo(19.335, 3)
    expect(Math.abs(sumPrecise - sumDisplay)).toBeGreaterThan(0.01)
  })
})

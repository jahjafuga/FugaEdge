// Ocean One gross/net precision (Beat B). The parser recomputed gross from the
// (possibly rounded) Entry/Exit prices and let a half-cent fall the wrong way
// (LABT: price-recompute 6.44 vs the file's authoritative Gross 6.45). Fix: read
// the file's own Gross column (which colMap already indexes) and round it
// half-away-from-zero so shorts don't round their magnitude down; net stays the
// derived gross - fees (coherence preserved — reading BOTH file columns breaks
// net=gross-fees on 4/135 fixture trips).
//
// Each row below is built so the price-recompute DIVERGES from the file's Gross,
// proving the parser now trusts the file, not the recompute.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseOceanOneXls } from '../parse-ocean-one'

const HEADER = [
  'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
  'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
]
// One trade row keyed by the fields that matter; fee cols default '0'.
function trade(o: {
  time: string; sym: string; type: string; entry: string; exit: string; qty: string;
  gross: string; comm?: string; net: string;
}): string[] {
  const r = new Array(21).fill('0')
  r[0] = `5/1/2026 ${o.time}`; r[1] = '9:59:00'; r[2] = '00:01:00'
  r[3] = o.sym; r[4] = o.type; r[5] = o.entry; r[6] = o.exit; r[7] = o.qty
  r[8] = o.gross; r[9] = o.comm ?? '0'; r[20] = o.net
  return r
}
function bufferOf(rows: string[][]): Uint8Array {
  const aoa: string[][] = [['5/1/2026'], HEADER, ...rows, ['Equities', '', '', '', '', '', '', '', '0'], []]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}
const bySym = (r: { roundTrips: { symbol: string }[] }, s: string) =>
  r.roundTrips.find((t) => t.symbol === s)! as unknown as { gross_pnl: number; net_pnl: number }

describe('parseOceanOneXls — reads the file Gross (Beat B), not the price-recompute', () => {
  it('LABT half-cent: file Gross 6.445 -> 6.45 and net 5.80, NOT recompute 6.44 / 5.79', () => {
    // Entry 3.30, Exit 3.53017857, Qty 28 -> price-recompute = 6.44499996 -> round2 6.44.
    // File Gross 6.445 -> 6.45. Fees 0.6465 -> 0.65 -> derived net = 6.45 - 0.65 = 5.80.
    const r = parseOceanOneXls(bufferOf([
      trade({ time: '9:37:35', sym: 'LABT', type: 'Long', entry: '3.30', exit: '3.53017857', qty: '28', gross: '6.445', comm: '0.6465', net: '5.7985' }),
    ]))
    const t = bySym(r, 'LABT')
    expect(t.gross_pnl).toBeCloseTo(6.45, 2)
    expect(t.net_pnl).toBeCloseTo(5.8, 2)
  })

  it('200-share divergence: uses the file Gross (98.00), not the ~$2-off recompute (100.00)', () => {
    // 200 * (5.50 - 5.00) = 100.00 recompute; file Gross 98.00 (true fills differ from avg prices).
    const r = parseOceanOneXls(bufferOf([
      trade({ time: '10:00:00', sym: 'CANF', type: 'Long', entry: '5.00', exit: '5.50', qty: '200', gross: '98.00', comm: '0.50', net: '97.50' }),
    ]))
    expect(bySym(r, 'CANF').gross_pnl).toBeCloseTo(98.0, 2)
  })

  it('short carries the file Gross sign and rounds magnitude half-away-from-zero: (6.445) -> -6.45', () => {
    // Short, Entry(sell) 3.30, Exit(buy) 3.53017857 -> recompute 28*3.30-28*3.53017857 = -6.44499996
    // -> round2 -6.44. File Gross (6.445) = -6.445 -> sign-safe round -> -6.45 (NOT -6.44).
    const r = parseOceanOneXls(bufferOf([
      trade({ time: '11:00:00', sym: 'OCCX', type: 'Short', entry: '3.30', exit: '3.53017857', qty: '28', gross: '(6.445)', comm: '0.10', net: '(6.545)' }),
    ]))
    expect(bySym(r, 'OCCX').gross_pnl).toBeCloseTo(-6.45, 2)
  })

  it('clean row (file Gross == recompute) is unchanged: 5.00', () => {
    // 10 * (2.50 - 2.00) = 5.00 both ways — no regression.
    const r = parseOceanOneXls(bufferOf([
      trade({ time: '12:00:00', sym: 'CLNZ', type: 'Long', entry: '2.00', exit: '2.50', qty: '10', gross: '5.00', comm: '0.05', net: '4.95' }),
    ]))
    expect(bySym(r, 'CLNZ').gross_pnl).toBeCloseTo(5.0, 2)
  })
})

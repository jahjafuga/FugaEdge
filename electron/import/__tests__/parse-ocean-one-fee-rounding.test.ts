// v0.2.7 Bug 5, Commit 2 — round ONCE, at the end.
//
// The parser read each fee cell at raw:false, i.e. the broker's 2dp DISPLAY, then
// summed those already-rounded pennies, then rounded again at every ledger
// accumulation (df.fee_ecn = round2(df.fee_ecn + ecn)). Over a seven-trip day the
// discarded halves compound and the column lands a cent away from the broker's own
// total — the total the user reconciles against.
//
// The raw:true read has existed since Beat B2a and already feeds total_fees_precise.
// This uses it for the components too: accumulate raw, round once on emit.
//
// FIXTURE: four ECN cells of 0.2975 each. Displays are "0.30" and sum to 1.20;
// the raw values sum to 1.19. Any round-then-sum path yields 1.20 and fails.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseOceanOneXls } from '../parse-ocean-one'

const HEADER = [
  'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
  'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
]
const GROSS_C = 8
const FEE_C = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
const COL = { comm: 9, ecn: 10, sec: 11, cat: 13, taf: 14, nscc: 16 }

interface Row { time: string; fees: Partial<Record<keyof typeof COL, number>> }

function bufferOf(rows: Row[]): Uint8Array {
  const aoa: unknown[][] = [['5/1/2026'], HEADER]
  rows.forEach((t) => {
    const r: unknown[] = new Array(21).fill(0)
    r[0] = `5/1/2026 ${t.time}`; r[1] = '9:59:00'; r[2] = '00:01:00'
    r[3] = 'VEEE'; r[4] = 'Long'; r[5] = 3.3; r[6] = 3.53; r[7] = 100
    r[GROSS_C] = 10; r[20] = 10
    for (const [k, c] of Object.entries(COL)) {
      r[c] = t.fees[k as keyof typeof COL] ?? 0
    }
    aoa.push(r)
  })
  aoa.push(['Equities', '', '', '', '', '', '', '', '0'], [])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  for (let row = 2; row < 2 + rows.length; row++) {
    for (const c of [GROSS_C, ...FEE_C]) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c })]
      if (cell && cell.t === 'n') cell.z = '0.00'
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}

const day = (rows: Row[]) => parseOceanOneXls(bufferOf(rows)).dayFees[0]

describe('Ocean One fee rounding — accumulate raw, round once', () => {
  // 0.2975 x 4: displays "0.30" (sum 1.20), raw sums to 1.19.
  const SUBCENT: Row[] = [
    { time: '9:31:00', fees: { ecn: 0.2975 } },
    { time: '9:32:00', fees: { ecn: 0.2975 } },
    { time: '9:33:00', fees: { ecn: 0.2975 } },
    { time: '9:34:00', fees: { ecn: 0.2975 } },
  ]

  it('T7 four cells displaying 0.30 whose raw values sum to 1.19 produce 1.19, not 1.20', () => {
    expect(day(SUBCENT).fee_ecn).toBeCloseTo(1.19, 2)
  })

  it('T8 the same rule holds for commission, sec, cat, finra and nscc — not ECN alone', () => {
    const each: Row[] = [
      { time: '9:31:00', fees: { comm: 0.2975, sec: 0.2975, cat: 0.2975, taf: 0.2975, nscc: 0.2975 } },
      { time: '9:32:00', fees: { comm: 0.2975, sec: 0.2975, cat: 0.2975, taf: 0.2975, nscc: 0.2975 } },
      { time: '9:33:00', fees: { comm: 0.2975, sec: 0.2975, cat: 0.2975, taf: 0.2975, nscc: 0.2975 } },
      { time: '9:34:00', fees: { comm: 0.2975, sec: 0.2975, cat: 0.2975, taf: 0.2975, nscc: 0.2975 } },
    ]
    const d = day(each)
    expect(d.fee_commission).toBeCloseTo(1.19, 2)
    expect(d.fee_sec).toBeCloseTo(1.19, 2)
    expect(d.fee_cat).toBeCloseTo(1.19, 2)
    expect(d.fee_finra).toBeCloseTo(1.19, 2)
    expect(d.fee_nscc).toBeCloseTo(1.19, 2)
  })

  it('T9 STAND-DOWN: a fixture with no sub-cent remainder is unchanged by the fix', () => {
    const clean: Row[] = [
      { time: '9:31:00', fees: { ecn: 0.25, comm: 0.1 } },
      { time: '9:32:00', fees: { ecn: 0.25, comm: 0.1 } },
    ]
    const d = day(clean)
    expect(d.fee_ecn).toBeCloseTo(0.5, 2)
    expect(d.fee_commission).toBeCloseTo(0.2, 2)
    expect(d.total_fees).toBeCloseTo(0.7, 2)
  })

  it('T10 GUARD: the ALREADY-CORRECT precise path is not moved by this fix', () => {
    // total_fees_precise has used the raw read since B2a. A cure that fixed the
    // rounded path by shifting the precise one would be a regression in disguise.
    const r = parseOceanOneXls(bufferOf(SUBCENT))
    const sum = r.roundTrips.reduce((a, t) => a + (t.total_fees_precise ?? 0), 0)
    expect(sum).toBeCloseTo(1.19, 4) // 4 x 0.2975 exactly
  })

  it('T11 the day total equals the sum of its components after the fix', () => {
    const d = day(SUBCENT)
    const parts =
      d.fee_ecn + d.fee_sec + d.fee_finra + d.fee_htb + d.fee_cat + d.fee_commission +
      d.fee_nscc + d.fee_other
    expect(parts).toBeCloseTo(d.total_fees, 2)
  })
})

// Ocean One fee-merge Beat 2 — the PARSER half. Two new obligations on
// parseOceanOneXls, both proven here on a synthetic sheet (no real data):
//
//   1. Every round trip is tagged source_format='summary' so the existing
//      (symbol,date) supersede (repo.ts markSummariesSuperseded) dedups an
//      Ocean One trip against a covering DAS execution instead of inserting a
//      duplicate. Today the parser leaves source_format unset → it commits as
//      'execution' → never superseded → the dupe bug.
//
//   2. The parser emits a per-(date,symbol) day_fees ledger (`dayFees`) so the
//      allocator can land Ocean One's fees on the surviving DAS trade. The 11
//      itemized OO columns map onto the schema-40 day_fees columns:
//        Comm → fee_commission,  Ecn Fee → fee_ecn,  SEC → fee_sec,
//        TAF → fee_finra,  CAT → fee_cat,
//        ORF/OCC/NSCC/Acc/Clr/Misc → fee_other,  (htb has no OO source → 0).
//      Rows are SUMMED across every trip sharing a (date,symbol) so day_fees
//      carries the whole day and total_fees ties to the trips it came from.
//
// Pure parser test (no DB) — mirrors the synthetic-fixture half of
// parse-ocean-one.test.ts.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseOceanOneXls } from '../parse-ocean-one'

// Two AAA trips on 2026-05-01 (must aggregate into ONE day_fees row) + one BBB.
// All cells are strings — the parser reads raw:false display strings.
function syntheticBuffer(): Uint8Array {
  const header = [
    'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
    'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
  ]
  const rows: string[][] = [
    ['5/1/2026'],
    header,
    // AAA #1 — Comm .10, Ecn .01, SEC .02, CAT .03, TAF .04, NSCC .05 (other). Σ=0.25.
    ['5/1/2026 9:37:35', '9:38:20', '00:00:45', 'AAA', 'Long', '2.00', '2.50', '10', '5.00',
      '0.10', '0.01', '0.02', '0', '0.03', '0.04', '0', '0.05', '0', '0', '0', '4.75'],
    // AAA #2 — Comm .20 only. Σ=0.20.
    ['5/1/2026 9:40:01', '9:41:00', '00:00:59', 'AAA', 'Long', '3.00', '3.10', '5', '0.50',
      '0.20', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0.30'],
    // BBB — Comm .07 only. Σ=0.07.
    ['5/1/2026 10:00:00', '10:05:00', '00:05:00', 'BBB', 'Long', '1.00', '1.20', '100', '20.00',
      '0.07', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '19.93'],
    ['Equities', '', '', '', '', '', '', '', '25.00'],
    [],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}

describe('parseOceanOneXls — Beat 2 summary tag + day_fees ledger', () => {
  it('tags every round trip source_format="summary"', () => {
    const r = parseOceanOneXls(syntheticBuffer())
    expect(r.roundTrips).toHaveLength(3)
    for (const t of r.roundTrips) {
      expect(t.source_format).toBe('summary')
    }
  })

  it('emits one aggregated day_fees row per (date, symbol)', () => {
    const r = parseOceanOneXls(syntheticBuffer())
    expect(r.dayFees).toHaveLength(2) // AAA (2 trips summed) + BBB
    const aaa = r.dayFees.find((d) => d.symbol === 'AAA')!
    const bbb = r.dayFees.find((d) => d.symbol === 'BBB')!
    expect(aaa.date).toBe('2026-05-01')
    expect(bbb.date).toBe('2026-05-01')
  })

  it('maps the OO fee columns onto the schema-40 day_fees columns and SUMS across trips', () => {
    const aaa = parseOceanOneXls(syntheticBuffer()).dayFees.find((d) => d.symbol === 'AAA')!
    expect(aaa.fee_commission).toBeCloseTo(0.3, 2) // 0.10 + 0.20
    expect(aaa.fee_ecn).toBeCloseTo(0.01, 2)
    expect(aaa.fee_sec).toBeCloseTo(0.02, 2)
    expect(aaa.fee_finra).toBeCloseTo(0.04, 2) // TAF
    expect(aaa.fee_cat).toBeCloseTo(0.03, 2)
    expect(aaa.fee_other).toBeCloseTo(0.05, 2) // NSCC
    expect(aaa.fee_htb).toBe(0)
    expect(aaa.total_fees).toBeCloseTo(0.45, 2) // 0.25 + 0.20
  })

  it('commission is carried DISTINCT into fee_commission (Dave’s ask), not lumped', () => {
    const bbb = parseOceanOneXls(syntheticBuffer()).dayFees.find((d) => d.symbol === 'BBB')!
    expect(bbb.fee_commission).toBeCloseTo(0.07, 2)
    expect(bbb.fee_other).toBe(0)
    expect(bbb.total_fees).toBeCloseTo(0.07, 2)
  })

  it('penny-tie: each day_fees row’s components sum to its total_fees AND to its trips’ total_fees', () => {
    const r = parseOceanOneXls(syntheticBuffer())
    for (const d of r.dayFees) {
      const components =
        d.fee_ecn + d.fee_sec + d.fee_finra + d.fee_htb + d.fee_cat + d.fee_commission + d.fee_other
      expect(components).toBeCloseTo(d.total_fees, 2)
      const tripSum = r.roundTrips
        .filter((t) => t.date === d.date && t.symbol === d.symbol)
        .reduce((acc, t) => acc + t.total_fees, 0)
      expect(d.total_fees).toBeCloseTo(tripSum, 2)
    }
  })
})

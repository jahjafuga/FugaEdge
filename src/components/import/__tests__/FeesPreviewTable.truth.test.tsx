// v0.2.7 Bug 5 — the daily-summary fee table must add up on screen.
//
// Dave reconciled his broker's numbers against this table and could not make the
// columns reach the Total. He was right: total_fees includes fee_commission and
// fee_other (the pooled ORF/OCC/NSCC/Acc/Clr/Misc bucket), and the table rendered
// NEITHER. A total containing invisible components is the defect — not the layout.
//
// Fixture is his real VEEE 13 Jul day, seven round trips, summed per component:
//   comm 0.30 0.10 0.15 0.10 0.10 0.10 0.55 -> 1.40
//   ecn  0.28 0.16 0.10 0.03 0.21 0.16 0.26 -> 1.20
//   sec  0.02 0.01 0.00 0.01 0.02 0.01 0.04 -> 0.11
//   cat  0.06 0.02 0.03 0.02 0.02 0.02 0.11 -> 0.28
//   taf  0.04 0.01 0.02 0.01 0.01 0.01 0.08 -> 0.18
//   nscc 0.06 0.02 0.03 0.02 0.02 0.02 0.11 -> 0.28
//   TOTAL                                      3.45

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FeesPreviewTable from '../FeesPreviewTable'
import type { DaySummaryFeeRow } from '@shared/import-types'

const VEEE: DaySummaryFeeRow = {
  date: '2026-07-13',
  symbol: 'VEEE',
  fee_ecn: 1.2,
  fee_sec: 0.11,
  fee_finra: 0.18,
  fee_htb: 0,
  fee_cat: 0.28,
  fee_nscc: 0.28,
  fee_commission: 1.4,
  fee_other: 0,
  total_fees: 3.45,
  status: 'new',
  matchedTrips: 7,
}

/** Every money cell in the row, in render order, as numbers. */
function moneyCells(): number[] {
  const row = screen.getAllByRole('row')[1]
  return Array.from(row.querySelectorAll<HTMLElement>('[data-fee-cell]')).map((el) =>
    Number.parseFloat(el.textContent!.replace(/[^0-9.-]/g, '')),
  )
}

const totalCell = () =>
  Number.parseFloat(
    screen.getByTestId('fee-total').textContent!.replace(/[^0-9.-]/g, ''),
  )

describe('FeesPreviewTable — the total must equal what is on screen', () => {
  it('T1 exposes commission, value 1.40', () => {
    render(<FeesPreviewTable fees={[VEEE]} dateOverride="" />)
    expect(screen.getByText('Comm')).toBeTruthy()
    expect(moneyCells()).toContain(1.4)
  })

  it('T2 exposes nscc, value 0.28, split out of the pooled bucket', () => {
    render(<FeesPreviewTable fees={[VEEE]} dateOverride="" />)
    expect(screen.getByText('NSCC')).toBeTruthy()
    const nscc = screen.getByTestId('fee-nscc')
    expect(Number.parseFloat(nscc.textContent!.replace(/[^0-9.-]/g, ''))).toBe(0.28)
  })

  it('T3 TOTAL equals the sum of the DISPLAYED columns — no hidden remainder', () => {
    render(<FeesPreviewTable fees={[VEEE]} dateOverride="" />)
    const visible = moneyCells().reduce((a, b) => a + b, 0)
    expect(Number(visible.toFixed(2))).toBe(totalCell())
    expect(totalCell()).toBe(3.45)
  })

  it('T4 a row carrying ORF/OCC still satisfies T3 — the residual pool is visible too', () => {
    // 0.09 of ORF+OCC that belongs to no named column. If "Other" were dropped
    // instead of rendered, the guarantee in T3 would be a fiction.
    const withPool: DaySummaryFeeRow = {
      ...VEEE,
      fee_other: 0.09,
      total_fees: Number((3.45 + 0.09).toFixed(2)),
    }
    render(<FeesPreviewTable fees={[withPool]} dateOverride="" />)
    expect(screen.getByText('Other')).toBeTruthy()
    const visible = moneyCells().reduce((a, b) => a + b, 0)
    expect(Number(visible.toFixed(2))).toBe(totalCell())
    expect(totalCell()).toBe(3.54)
  })

  it('T5 STAND-DOWN: a zero-fee symbol-day renders zeros, not blanks, and TOTAL is 0.00', () => {
    const zero: DaySummaryFeeRow = {
      ...VEEE,
      fee_ecn: 0, fee_sec: 0, fee_finra: 0, fee_htb: 0, fee_cat: 0,
      fee_nscc: 0, fee_commission: 0, fee_other: 0, total_fees: 0,
    }
    render(<FeesPreviewTable fees={[zero]} dateOverride="" />)
    const cells = moneyCells()
    expect(cells.length).toBeGreaterThan(0)
    for (const c of cells) expect(c).toBe(0)
    expect(totalCell()).toBe(0)
  })

  it('T6 HEALTHY: HTB still renders its real value — it is NOT being removed', () => {
    const htb: DaySummaryFeeRow = {
      ...VEEE,
      fee_htb: 2.5,
      total_fees: Number((3.45 + 2.5).toFixed(2)),
    }
    render(<FeesPreviewTable fees={[htb]} dateOverride="" />)
    expect(screen.getByText('HTB')).toBeTruthy()
    expect(
      Number.parseFloat(screen.getByTestId('fee-htb').textContent!.replace(/[^0-9.-]/g, '')),
    ).toBe(2.5)
  })
})

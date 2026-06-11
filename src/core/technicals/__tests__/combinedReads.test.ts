import { describe, it, expect } from 'vitest'
import {
  classifyAlignment,
  computeCombinedReads,
  rowsForAlignment,
} from '../combinedReads'
import type { CombinedReadsStats } from '../combinedReads'
import type {
  TechnicalSnapshot,
  TradeWithTechnicalsRow,
} from '@shared/technicals-types'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

// RED-first tests for the Combined Signal Reads aggregation (spec §B Section 5 /
// §A9) — the full-alignment vs any-misalignment 2-cell comparison. Alignment =
// macd_positive AND above_vwap AND above_9ema on the toggled timeframe, with the
// strict (> 0) binary off the snapshot.
//
// SETTLED null-handling (matches computeHeaderStrip's disciplineScore exactly):
// only the data gate (technicals null / !data_complete) is EXCLUDED. A
// data-complete trade with a null snapshot value is NOT excluded — its above_*
// reads false, so it lands in 'misaligned'. The two alignment surfaces stay
// consistent. The (C4)/(T6) tests pin this.

// A fully-aligned snapshot; tests override one field to break a single clause
// (including overriding to null, which is why overrides is Partial<TechnicalSnapshot>).
const ALIGNED: Partial<TechnicalSnapshot> = {
  macd_positive: true,
  vwap_dist_pct: 1.0,
  ema9_dist_pct: 1.0,
}

function row(
  id: number,
  net_pnl: number,
  overrides: Partial<TechnicalSnapshot> = {},
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({ ...ALIGNED, ...overrides }),
  })
}

const EMPTY_BUCKET = {
  n: 0,
  winRate: null,
  netPnl: 0,
  avgWinner: null,
  avgLoser: null,
  expectancy: null,
}

// Three-tier invariant — excluded + aligned.n + misaligned.n accounts for every
// input row exactly once (no unclassified tier).
function expectTierInvariant(r: CombinedReadsStats, total: number): void {
  expect(r.excluded + r.aligned.n + r.misaligned.n).toBe(total)
}

// ── classifyAlignment ────────────────────────────────────────────────────────
describe('classifyAlignment', () => {
  it('(C1) all three clauses hold → aligned', () => {
    expect(classifyAlignment(row(1, 0), '1m')).toBe('aligned')
  })

  it('(C2) any single clause failing → misaligned', () => {
    expect(classifyAlignment(row(1, 0, { macd_positive: false }), '1m')).toBe('misaligned')
    expect(classifyAlignment(row(2, 0, { vwap_dist_pct: -0.5 }), '1m')).toBe('misaligned')
    expect(classifyAlignment(row(3, 0, { ema9_dist_pct: -0.5 }), '1m')).toBe('misaligned')
  })

  it('(C3) above_* is strict (> 0): exactly 0 → misaligned', () => {
    expect(classifyAlignment(row(1, 0, { vwap_dist_pct: 0 }), '1m')).toBe('misaligned')
    expect(classifyAlignment(row(2, 0, { ema9_dist_pct: 0 }), '1m')).toBe('misaligned')
  })

  it('(C4) null snapshot value → misaligned, NOT excluded (matches disciplineScore)', () => {
    // Data-complete but a null dist / null macd: stays classified (not gated out),
    // and reads as not-aligned — identical to computeHeaderStrip's handling.
    expect(classifyAlignment(row(1, 0, { vwap_dist_pct: null }), '1m')).toBe('misaligned')
    expect(classifyAlignment(row(2, 0, { ema9_dist_pct: null }), '1m')).toBe('misaligned')
    expect(classifyAlignment(row(3, 0, { macd_positive: null }), '1m')).toBe('misaligned')
  })

  it('(C5) technicals null → null (excluded gate)', () => {
    expect(classifyAlignment(makeRow({ technicals: null }), '1m')).toBeNull()
  })

  it('(C6) data_complete false → null (excluded gate)', () => {
    const tech = makeCompleteSnapshot(ALIGNED)
    tech.data_complete = false
    expect(classifyAlignment(makeRow({ technicals: tech }), '1m')).toBeNull()
  })

  it('(C7) classification follows the toggled timeframe', () => {
    const tech = makeCompleteSnapshot(
      ALIGNED, // 1m → aligned
      { ...ALIGNED, macd_positive: false }, // 5m → misaligned
    )
    const r = makeRow({ technicals: tech })
    expect(classifyAlignment(r, '1m')).toBe('aligned')
    expect(classifyAlignment(r, '5m')).toBe('misaligned')
  })
})

// ── computeCombinedReads ─────────────────────────────────────────────────────
describe('computeCombinedReads', () => {
  it('(T1) empty input → excluded 0, both cells empty', () => {
    const r = computeCombinedReads([], '1m')
    expect(r.excluded).toBe(0)
    expect(r.aligned).toEqual(EMPTY_BUCKET)
    expect(r.misaligned).toEqual(EMPTY_BUCKET)
    expectTierInvariant(r, 0)
  })

  it('(T2) all data-gate-fail → excluded = N, both cells empty', () => {
    const rows = [
      makeRow({ id: 1, technicals: null }),
      makeRow({ id: 2, technicals: null }),
    ]
    const r = computeCombinedReads(rows, '1m')
    expect(r.excluded).toBe(2)
    expect(r.aligned.n).toBe(0)
    expect(r.misaligned.n).toBe(0)
    expectTierInvariant(r, 2)
  })

  it('(T3) mixed → three-tier split, invariant holds', () => {
    const incomplete = makeCompleteSnapshot(ALIGNED)
    incomplete.data_complete = false
    const rows = [
      makeRow({ id: 1, technicals: null }), // excluded
      makeRow({ id: 2, technicals: incomplete }), // excluded
      row(3, 100), // aligned
      row(4, 100), // aligned
      row(5, 100, { macd_positive: false }), // misaligned
    ]
    const r = computeCombinedReads(rows, '1m')
    expect(r.excluded).toBe(2)
    expect(r.aligned.n).toBe(2)
    expect(r.misaligned.n).toBe(1)
    expectTierInvariant(r, 5)
  })

  it('(T4) BucketStats math on the aligned cell (n=5)', () => {
    // 3 winners (100,200,300) + 2 losers (-50,-150), all aligned.
    const rows = [
      row(1, 100),
      row(2, 200),
      row(3, 300),
      row(4, -50),
      row(5, -150),
    ]
    const b = computeCombinedReads(rows, '1m').aligned
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(0.6)
    expect(b.netPnl).toBe(400)
    expect(b.avgWinner).toBe(200)
    expect(b.avgLoser).toBe(-100)
    expect(b.expectancy).toBe(80) // 400 / 5
  })

  it('(T5) n=4 → expectancy suppressed to null, win rate still shown (§C)', () => {
    const rows = Array.from({ length: 4 }, (_, i) => row(i + 1, 100))
    const b = computeCombinedReads(rows, '1m').aligned
    expect(b.n).toBe(4)
    expect(b.winRate).toBe(1)
    expect(b.expectancy).toBeNull()
  })

  it('(T6) data-complete null-snapshot trades count in misaligned, not excluded', () => {
    const rows = [row(1, 100, { vwap_dist_pct: null }), row(2, 100, { ema9_dist_pct: null })]
    const r = computeCombinedReads(rows, '1m')
    expect(r.excluded).toBe(0)
    expect(r.misaligned.n).toBe(2)
    expect(r.aligned.n).toBe(0)
    expectTierInvariant(r, 2)
  })
})

// ── rowsForAlignment ─────────────────────────────────────────────────────────
describe('rowsForAlignment', () => {
  it('(R1) empty input → [] for both keys', () => {
    expect(rowsForAlignment([], '1m', 'aligned')).toEqual([])
    expect(rowsForAlignment([], '1m', 'misaligned')).toEqual([])
  })

  it('(R2) single aligned row → returned for aligned, [] for misaligned', () => {
    const r = row(1, 100)
    expect(rowsForAlignment([r], '1m', 'aligned')).toEqual([r])
    expect(rowsForAlignment([r], '1m', 'misaligned')).toEqual([])
  })

  it('(R3) gate-fail rows never appear; mix partitions correctly', () => {
    const gateFail = makeRow({ id: 1, technicals: null })
    const aligned = row(2, 100)
    const misaligned = row(3, 100, { macd_positive: false })
    const rows = [gateFail, aligned, misaligned]
    expect(rowsForAlignment(rows, '1m', 'aligned')).toEqual([aligned])
    expect(rowsForAlignment(rows, '1m', 'misaligned')).toEqual([misaligned])
  })
})

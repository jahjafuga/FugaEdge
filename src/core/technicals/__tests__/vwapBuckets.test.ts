import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  classifyVwapBucket,
  computeVwapBuckets,
  rowsForVwapBucket,
  VWAP_BUCKETS,
  VWAP_BUCKET_EXTENT,
} from '../vwapBuckets'
import type { VwapBucketStats } from '../vwapBuckets'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

// VWAP distance 7-bucket aggregation — re-pinned to the CANONICAL signed scheme
// (Dave #10: the band adopts the edges his EMA proposal already ships, cc3932a).
// Same machinery as before (tiers, partition invariant, BucketStats math); the
// edges, labels, barValues, and extent are the canonical band's. A classifiable
// row is placed by its 1m vwap_dist_pct; tf_5m stays at DEFAULT unless a test
// sets it.
function vwapRow(
  id: number,
  net_pnl: number,
  dist: number | null,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({ vwap_dist_pct: dist }),
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

const VWAP_KEYS = VWAP_BUCKETS.map((b) => b.key)

// Partition invariant — denominator equals the sum of all 7 bucket counts, so
// no trade is lost or double-counted.
function expectDenominatorInvariant(r: VwapBucketStats): void {
  const sum = VWAP_KEYS.reduce((acc, k) => acc + r.buckets[k].n, 0)
  expect(r.denominator).toBe(sum)
}

// ── VWAP_BUCKETS metadata ────────────────────────────────────────────────────
describe('VWAP_BUCKETS metadata (canonical scheme)', () => {
  it('(M1) is the canonical 7-bucket single source of truth (keys, edges, barValues)', () => {
    expect(VWAP_BUCKETS).toHaveLength(7)
    expect(VWAP_KEYS).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'])
    // v2-centered, right-weighted axis — the EMA e-scheme mirrored.
    expect(VWAP_BUCKETS.map((b) => b.barValue)).toEqual([-1, 0, 1, 2, 3, 4, 5])
    expect(VWAP_BUCKET_EXTENT).toBe(5)
    expect(VWAP_BUCKETS[0].lo).toBe(-Infinity)
    expect(VWAP_BUCKETS[6].hi).toBe(Infinity)
    // At-VWAP is the SECOND bucket now (one below bucket, per the canon).
    const atVwap = VWAP_BUCKETS[1]
    expect(atVwap.key).toBe('v2')
    expect(atVwap.lo).toBe(-0.5)
    expect(atVwap.hi).toBe(0.5)
    expect(atVwap.barValue).toBe(0)
    expect(atVwap.label).toContain('At VWAP')
  })

  it('(M2) the new descriptors, verbatim', () => {
    expect(VWAP_BUCKETS.map((b) => b.label)).toEqual([
      'Below VWAP / broken trend < -0.5%',
      'At VWAP (equilibrium) -0.5% to +0.5%',
      'Near VWAP (pullback zone) +0.5% to +2.0%',
      'Above VWAP (trending) +2.0% to +5.0%',
      'Extended +5.0% to +10.0%',
      'Very extended +10.0% to +20.0%',
      'Blow-off / parabolic > +20.0%',
    ])
  })

  it("(M3) the editorializing died with the ticket: 'danger' and 'chasing' are banned from the module", () => {
    // The ticket's core complaint: the old "Parabolic / danger" label
    // editorialized against momentum strategy while his own data showed that
    // zone winning. Ban the words from the WHOLE module source (labels,
    // comments, everything) so they cannot creep back in prose either.
    const src = readFileSync(
      fileURLToPath(new URL('../vwapBuckets.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/danger/i)
    expect(src).not.toMatch(/chasing/i)
  })
})

// ── classifyVwapBucket ───────────────────────────────────────────────────────
describe('classifyVwapBucket (canonical edges)', () => {
  it('(C1) places interior values into v1..v7', () => {
    expect(classifyVwapBucket(vwapRow(1, 0, -2.0), '1m')).toBe('v1')
    expect(classifyVwapBucket(vwapRow(2, 0, 0), '1m')).toBe('v2')
    expect(classifyVwapBucket(vwapRow(3, 0, 1.0), '1m')).toBe('v3')
    expect(classifyVwapBucket(vwapRow(4, 0, 3.0), '1m')).toBe('v4')
    expect(classifyVwapBucket(vwapRow(5, 0, 7.0), '1m')).toBe('v5')
    expect(classifyVwapBucket(vwapRow(6, 0, 15.0), '1m')).toBe('v6')
    expect(classifyVwapBucket(vwapRow(7, 0, 25.0), '1m')).toBe('v7')
  })

  it('(C2) every edge is left-inclusive, right-exclusive', () => {
    expect(classifyVwapBucket(vwapRow(1, 0, -0.5), '1m')).toBe('v2') // -0.5 = At's lower edge
    expect(classifyVwapBucket(vwapRow(2, 0, 0.5), '1m')).toBe('v3') // +0.5 → Near, NOT At
    expect(classifyVwapBucket(vwapRow(3, 0, 2.0), '1m')).toBe('v4') // +2.0 → Above
    expect(classifyVwapBucket(vwapRow(4, 0, 5.0), '1m')).toBe('v5') // +5.0 → Extended
    expect(classifyVwapBucket(vwapRow(5, 0, 10.0), '1m')).toBe('v6') // +10.0 → Very extended
    expect(classifyVwapBucket(vwapRow(6, 0, 20.0), '1m')).toBe('v7') // +20.0 → Blow-off
  })

  it("(C2b) the old scheme's 10.0 → v7 fixture now lands v6; +25 → v7", () => {
    expect(classifyVwapBucket(vwapRow(1, 0, 10.0), '1m')).toBe('v6')
    expect(classifyVwapBucket(vwapRow(2, 0, 25.0), '1m')).toBe('v7')
  })

  it('(C3) technicals null → null (data gate)', () => {
    expect(classifyVwapBucket(makeRow({ technicals: null }), '1m')).toBeNull()
  })

  it('(C4) data_complete false → null (data gate)', () => {
    const tech = makeCompleteSnapshot({ vwap_dist_pct: 0 })
    tech.data_complete = false
    expect(classifyVwapBucket(makeRow({ technicals: tech }), '1m')).toBeNull()
  })

  it('(C5) vwap_dist_pct null → null (unclassifiable)', () => {
    expect(classifyVwapBucket(vwapRow(1, 0, null), '1m')).toBeNull()
  })

  it('(C6) classification follows the toggled timeframe', () => {
    const tech = makeCompleteSnapshot(
      { vwap_dist_pct: 0 }, // 1m → v2 (At VWAP)
      { vwap_dist_pct: 25.0 }, // 5m → v7 (Blow-off)
    )
    const row = makeRow({ technicals: tech })
    expect(classifyVwapBucket(row, '1m')).toBe('v2')
    expect(classifyVwapBucket(row, '5m')).toBe('v7')
  })
})

// ── computeVwapBuckets — exclusion tiers ─────────────────────────────────────
describe('computeVwapBuckets — exclusion tiers (unchanged machinery)', () => {
  it('(T1) empty input → all tiers zero, all buckets empty', () => {
    const r = computeVwapBuckets([], '1m')
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(0)
    expect(r.denominator).toBe(0)
    for (const k of VWAP_KEYS) expect(r.buckets[k]).toEqual(EMPTY_BUCKET)
    expectDenominatorInvariant(r)
  })

  it('(T2) all data-gate-fail (technicals null) → excluded = N', () => {
    const rows = [
      makeRow({ id: 1, technicals: null }),
      makeRow({ id: 2, technicals: null }),
      makeRow({ id: 3, technicals: null }),
    ]
    const r = computeVwapBuckets(rows, '1m')
    expect(r.excluded).toBe(3)
    expect(r.unclassified).toBe(0)
    expect(r.denominator).toBe(0)
    expectDenominatorInvariant(r)
  })

  it('(T3) data-complete but vwap_dist_pct null → unclassified, not excluded', () => {
    const rows = [vwapRow(1, 0, null), vwapRow(2, 0, null)]
    const r = computeVwapBuckets(rows, '1m')
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(2)
    expect(r.denominator).toBe(0)
    expectDenominatorInvariant(r)
  })

  it('(T4) mixed tiers → 2 excluded, 1 unclassified, 3 classifiable', () => {
    const incomplete = makeCompleteSnapshot({ vwap_dist_pct: 0 })
    incomplete.data_complete = false
    const rows = [
      makeRow({ id: 1, technicals: null }), // gate fail (null)
      makeRow({ id: 2, technicals: incomplete }), // gate fail (incomplete)
      vwapRow(3, 0, null), // unclassified (vwap null)
      vwapRow(4, 100, 0), // v2 (At)
      vwapRow(5, 100, 0), // v2
      vwapRow(6, 100, 0), // v2
    ]
    const r = computeVwapBuckets(rows, '1m')
    expect(r.excluded).toBe(2)
    expect(r.unclassified).toBe(1)
    expect(r.denominator).toBe(3)
    expect(r.buckets.v2.n).toBe(3)
    expectDenominatorInvariant(r)
  })
})

// ── computeVwapBuckets — partition + math ────────────────────────────────────
describe('computeVwapBuckets — partition + math', () => {
  it('(T5) one trade per bucket → denominator 7, each n=1, distinct netPnl', () => {
    const rows = [
      vwapRow(1, 10, -2.0), // v1
      vwapRow(2, 20, 0), // v2
      vwapRow(3, 30, 1.0), // v3
      vwapRow(4, 40, 3.0), // v4
      vwapRow(5, 50, 7.0), // v5
      vwapRow(6, 60, 15.0), // v6
      vwapRow(7, 70, 25.0), // v7
    ]
    const r = computeVwapBuckets(rows, '1m')
    expect(r.denominator).toBe(7)
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(0)
    expect(r.buckets.v1.netPnl).toBe(10)
    expect(r.buckets.v2.netPnl).toBe(20)
    expect(r.buckets.v3.netPnl).toBe(30)
    expect(r.buckets.v4.netPnl).toBe(40)
    expect(r.buckets.v5.netPnl).toBe(50)
    expect(r.buckets.v6.netPnl).toBe(60)
    expect(r.buckets.v7.netPnl).toBe(70)
    for (const k of VWAP_KEYS) expect(r.buckets[k].n).toBe(1)
    expectDenominatorInvariant(r)
  })

  it('(T6) winners + losers (n=5) → winRate, avgs, expectancy = netPnl/n', () => {
    // 3 winners (100,200,300) + 2 losers (-50,-150) in v2 (At VWAP).
    const rows = [
      vwapRow(1, 100, 0),
      vwapRow(2, 200, 0),
      vwapRow(3, 300, 0),
      vwapRow(4, -50, 0),
      vwapRow(5, -150, 0),
    ]
    const b = computeVwapBuckets(rows, '1m').buckets.v2
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(0.6)
    expect(b.netPnl).toBe(400)
    expect(b.avgWinner).toBe(200)
    expect(b.avgLoser).toBe(-100)
    expect(b.expectancy).toBe(80) // 400 / 5, computed at n=5
  })

  it('(T7) n=4 → expectancy suppressed to null, winRate still shown (§C:104)', () => {
    const rows = Array.from({ length: 4 }, (_, i) => vwapRow(i + 1, 100, 0))
    const b = computeVwapBuckets(rows, '1m').buckets.v2
    expect(b.n).toBe(4)
    expect(b.winRate).toBe(1)
    expect(b.expectancy).toBeNull()
  })
})

// ── rowsForVwapBucket ────────────────────────────────────────────────────────
describe('rowsForVwapBucket', () => {
  it('(R1) empty input → [] for every bucket key', () => {
    for (const k of VWAP_KEYS) expect(rowsForVwapBucket([], '1m', k)).toEqual([])
  })

  it('(R2) single At-VWAP row → returned for v2, [] for v3', () => {
    const row = vwapRow(1, 100, 0)
    expect(rowsForVwapBucket([row], '1m', 'v2')).toEqual([row])
    expect(rowsForVwapBucket([row], '1m', 'v3')).toEqual([])
  })

  it('(R3) gate-fail + unclassified rows never appear in any bucket', () => {
    const incomplete = makeCompleteSnapshot({ vwap_dist_pct: 0 })
    incomplete.data_complete = false
    const gateFailNull = makeRow({ id: 1, technicals: null })
    const gateFailIncomplete = makeRow({ id: 2, technicals: incomplete })
    const unclassified = vwapRow(3, 0, null)
    const atVwap = vwapRow(4, 100, 0)
    const rows = [gateFailNull, gateFailIncomplete, unclassified, atVwap]
    const allBucketed = VWAP_KEYS.flatMap((k) => rowsForVwapBucket(rows, '1m', k))
    expect(allBucketed).toEqual([atVwap])
    expect(allBucketed).not.toContain(gateFailNull)
    expect(allBucketed).not.toContain(gateFailIncomplete)
    expect(allBucketed).not.toContain(unclassified)
  })

  it('(R4) timeframe-dependent: same row resolves to different buckets per timeframe', () => {
    const tech = makeCompleteSnapshot(
      { vwap_dist_pct: 0 }, // 1m → v2
      { vwap_dist_pct: 25.0 }, // 5m → v7
    )
    const row = makeRow({ technicals: tech })
    expect(rowsForVwapBucket([row], '1m', 'v2')).toEqual([row])
    expect(rowsForVwapBucket([row], '5m', 'v7')).toEqual([row])
    expect(rowsForVwapBucket([row], '1m', 'v7')).toEqual([])
  })
})

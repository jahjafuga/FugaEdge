import { describe, it, expect } from 'vitest'
import {
  classifyEmaBucket,
  classifyEmaCrossover,
  computeEmaBuckets,
  rowsForEmaBucket,
  EMA_BUCKETS,
  EMA_BUCKET_EXTENT,
} from '../emaBuckets'
import type { EmaBucketStats } from '../emaBuckets'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

// RED-first tests for the EMA distance 6-bucket aggregation (spec §A5),
// paralleling vwapBuckets.test.ts. A classifiable row is placed by its 1m
// ema9_dist_pct; the 9/20 crossover (ema9_above_ema20) is an INDEPENDENT
// dimension, so emaRow takes `above` separately (default null = crossover-null,
// keeping the distance-only tests off the crossover axis). tf_5m stays at DEFAULT
// (irrelevant to the 1m tests).
function emaRow(
  id: number,
  net_pnl: number,
  dist: number | null,
  above: boolean | null = null,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({
      ema9_dist_pct: dist,
      ema9_above_ema20: above,
    }),
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

const EMA_KEYS = EMA_BUCKETS.map((b) => b.key)

// Partition invariant — denominator equals the sum of all 6 distance-bucket
// counts (crossover is a separate dimension, excluded from this sum), so no
// trade is lost or double-counted on the distance axis.
function expectDenominatorInvariant(r: EmaBucketStats): void {
  const sum = EMA_KEYS.reduce((acc, k) => acc + r.buckets[k].n, 0)
  expect(r.denominator).toBe(sum)
}

// ── EMA_BUCKETS metadata ─────────────────────────────────────────────────────
describe('EMA_BUCKETS metadata', () => {
  it('(M1) is the 6-bucket §A5 single source of truth (keys, edges, barValues)', () => {
    expect(EMA_BUCKETS).toHaveLength(6)
    expect(EMA_KEYS).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'])
    // Linear index − 2 (1-based), e2 (At 9 EMA) centred on the equilibrium axis.
    expect(EMA_BUCKETS.map((b) => b.barValue)).toEqual([-1, 0, 1, 2, 3, 4])
    expect(EMA_BUCKET_EXTENT).toBe(4)
    expect(EMA_BUCKETS[0].lo).toBe(-Infinity)
    expect(EMA_BUCKETS[5].hi).toBe(Infinity)
    const at9ema = EMA_BUCKETS[1]
    expect(at9ema.key).toBe('e2')
    expect(at9ema.lo).toBe(-0.5)
    expect(at9ema.hi).toBe(0.5)
    expect(at9ema.barValue).toBe(0)
    expect(at9ema.label).toContain('At 9 EMA')
  })
})

// ── classifyEmaBucket ────────────────────────────────────────────────────────
describe('classifyEmaBucket', () => {
  it('(C1) places interior values into e1..e6', () => {
    expect(classifyEmaBucket(emaRow(1, 0, -1.0), '1m')).toBe('e1')
    expect(classifyEmaBucket(emaRow(2, 0, 0), '1m')).toBe('e2')
    expect(classifyEmaBucket(emaRow(3, 0, 1.0), '1m')).toBe('e3')
    expect(classifyEmaBucket(emaRow(4, 0, 3.0), '1m')).toBe('e4')
    expect(classifyEmaBucket(emaRow(5, 0, 7.0), '1m')).toBe('e5')
    expect(classifyEmaBucket(emaRow(6, 0, 15.0), '1m')).toBe('e6')
  })

  it('(C2) edges are left-inclusive, right-exclusive (§A5)', () => {
    expect(classifyEmaBucket(emaRow(1, 0, -0.5), '1m')).toBe('e2') // -0.5 = e2 lower edge
    expect(classifyEmaBucket(emaRow(2, 0, 0.5), '1m')).toBe('e3') // +0.5 → e3, NOT e2
    expect(classifyEmaBucket(emaRow(3, 0, 2.0), '1m')).toBe('e4')
    expect(classifyEmaBucket(emaRow(4, 0, 5.0), '1m')).toBe('e5')
    expect(classifyEmaBucket(emaRow(5, 0, 10.0), '1m')).toBe('e6')
  })

  it('(C3) technicals null → null (data gate)', () => {
    expect(classifyEmaBucket(makeRow({ technicals: null }), '1m')).toBeNull()
  })

  it('(C4) data_complete false → null (data gate)', () => {
    const tech = makeCompleteSnapshot({ ema9_dist_pct: 0 })
    tech.data_complete = false
    expect(classifyEmaBucket(makeRow({ technicals: tech }), '1m')).toBeNull()
  })

  it('(C5) ema9_dist_pct null → null (unclassifiable)', () => {
    expect(classifyEmaBucket(emaRow(1, 0, null), '1m')).toBeNull()
  })

  it('(C6) classification follows the toggled timeframe', () => {
    const tech = makeCompleteSnapshot(
      { ema9_dist_pct: 0 }, // 1m → e2 (At 9 EMA)
      { ema9_dist_pct: 15.0 }, // 5m → e6 (Blow-off)
    )
    const row = makeRow({ technicals: tech })
    expect(classifyEmaBucket(row, '1m')).toBe('e2')
    expect(classifyEmaBucket(row, '5m')).toBe('e6')
  })
})

// ── classifyEmaCrossover ─────────────────────────────────────────────────────
describe('classifyEmaCrossover', () => {
  it('(X1) maps ema9_above_ema20 true → stacked, false → broken', () => {
    expect(classifyEmaCrossover(emaRow(1, 0, 0, true), '1m')).toBe('stacked')
    expect(classifyEmaCrossover(emaRow(2, 0, 0, false), '1m')).toBe('broken')
  })

  it('(X2) technicals null → null (data gate)', () => {
    expect(classifyEmaCrossover(makeRow({ technicals: null }), '1m')).toBeNull()
  })

  it('(X3) data_complete false → null (data gate)', () => {
    const tech = makeCompleteSnapshot({ ema9_above_ema20: true })
    tech.data_complete = false
    expect(classifyEmaCrossover(makeRow({ technicals: tech }), '1m')).toBeNull()
  })

  it('(X4) ema9_above_ema20 null → null (unclassifiable)', () => {
    expect(classifyEmaCrossover(emaRow(1, 0, 0, null), '1m')).toBeNull()
  })

  it('(X5) crossover follows the toggled timeframe', () => {
    const tech = makeCompleteSnapshot(
      { ema9_above_ema20: true }, // 1m → stacked
      { ema9_above_ema20: false }, // 5m → broken
    )
    const row = makeRow({ technicals: tech })
    expect(classifyEmaCrossover(row, '1m')).toBe('stacked')
    expect(classifyEmaCrossover(row, '5m')).toBe('broken')
  })

  it('(X6) is independent of distance classification', () => {
    // Distance-classifiable (e2) but crossover-null (ema9_above_ema20 null).
    const distOnly = emaRow(1, 0, 0, null)
    expect(classifyEmaBucket(distOnly, '1m')).toBe('e2')
    expect(classifyEmaCrossover(distOnly, '1m')).toBeNull()
    // Crossover-classifiable (stacked) but distance-unclassified (dist null).
    const crossOnly = emaRow(2, 0, null, true)
    expect(classifyEmaBucket(crossOnly, '1m')).toBeNull()
    expect(classifyEmaCrossover(crossOnly, '1m')).toBe('stacked')
  })
})

// ── computeEmaBuckets — exclusion tiers ──────────────────────────────────────
describe('computeEmaBuckets — exclusion tiers', () => {
  it('(T1) empty input → all tiers zero, all buckets + crossover empty', () => {
    const r = computeEmaBuckets([], '1m')
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(0)
    expect(r.denominator).toBe(0)
    for (const k of EMA_KEYS) expect(r.buckets[k]).toEqual(EMPTY_BUCKET)
    expect(r.crossover.stacked).toEqual(EMPTY_BUCKET)
    expect(r.crossover.broken).toEqual(EMPTY_BUCKET)
    expectDenominatorInvariant(r)
  })

  it('(T2) all data-gate-fail (technicals null) → excluded = N', () => {
    const rows = [
      makeRow({ id: 1, technicals: null }),
      makeRow({ id: 2, technicals: null }),
      makeRow({ id: 3, technicals: null }),
    ]
    const r = computeEmaBuckets(rows, '1m')
    expect(r.excluded).toBe(3)
    expect(r.unclassified).toBe(0)
    expect(r.denominator).toBe(0)
    // Gate-failed rows feed neither crossover side.
    expect(r.crossover.stacked.n).toBe(0)
    expect(r.crossover.broken.n).toBe(0)
    expectDenominatorInvariant(r)
  })

  it('(T3) data-complete but ema9_dist_pct null → unclassified, not excluded', () => {
    const rows = [emaRow(1, 0, null, null), emaRow(2, 0, null, null)]
    const r = computeEmaBuckets(rows, '1m')
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(2)
    expect(r.denominator).toBe(0)
    expectDenominatorInvariant(r)
  })

  it('(T4) mixed tiers → 2 excluded, 1 unclassified, 3 classifiable', () => {
    const incomplete = makeCompleteSnapshot({ ema9_dist_pct: 0 })
    incomplete.data_complete = false
    const rows = [
      makeRow({ id: 1, technicals: null }), // gate fail (null)
      makeRow({ id: 2, technicals: incomplete }), // gate fail (incomplete)
      emaRow(3, 0, null, null), // unclassified (ema9_dist null)
      emaRow(4, 100, 0, null), // e2
      emaRow(5, 100, 0, null), // e2
      emaRow(6, 100, 0, null), // e2
    ]
    const r = computeEmaBuckets(rows, '1m')
    expect(r.excluded).toBe(2)
    expect(r.unclassified).toBe(1)
    expect(r.denominator).toBe(3)
    expect(r.buckets.e2.n).toBe(3)
    expectDenominatorInvariant(r)
  })
})

// ── computeEmaBuckets — partition + math ─────────────────────────────────────
describe('computeEmaBuckets — partition + math', () => {
  it('(T5) one trade per bucket → denominator 6, each n=1, distinct netPnl', () => {
    const rows = [
      emaRow(1, 10, -1.0), // e1
      emaRow(2, 20, 0), // e2
      emaRow(3, 30, 1.0), // e3
      emaRow(4, 40, 3.0), // e4
      emaRow(5, 50, 7.0), // e5
      emaRow(6, 60, 15.0), // e6
    ]
    const r = computeEmaBuckets(rows, '1m')
    expect(r.denominator).toBe(6)
    expect(r.excluded).toBe(0)
    expect(r.unclassified).toBe(0)
    expect(r.buckets.e1.netPnl).toBe(10)
    expect(r.buckets.e2.netPnl).toBe(20)
    expect(r.buckets.e3.netPnl).toBe(30)
    expect(r.buckets.e4.netPnl).toBe(40)
    expect(r.buckets.e5.netPnl).toBe(50)
    expect(r.buckets.e6.netPnl).toBe(60)
    for (const k of EMA_KEYS) expect(r.buckets[k].n).toBe(1)
    expectDenominatorInvariant(r)
  })

  it('(T6) winners + losers (n=5) → winRate, avgs, expectancy = netPnl/n', () => {
    // 3 winners (100,200,300) + 2 losers (-50,-150) in e2.
    const rows = [
      emaRow(1, 100, 0),
      emaRow(2, 200, 0),
      emaRow(3, 300, 0),
      emaRow(4, -50, 0),
      emaRow(5, -150, 0),
    ]
    const b = computeEmaBuckets(rows, '1m').buckets.e2
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(0.6)
    expect(b.netPnl).toBe(400)
    expect(b.avgWinner).toBe(200)
    expect(b.avgLoser).toBe(-100)
    expect(b.expectancy).toBe(80) // 400 / 5, computed at n=5
  })

  it('(T7) n=4 → expectancy suppressed to null, winRate still shown (§C:104)', () => {
    const rows = Array.from({ length: 4 }, (_, i) => emaRow(i + 1, 100, 0))
    const b = computeEmaBuckets(rows, '1m').buckets.e2
    expect(b.n).toBe(4)
    expect(b.winRate).toBe(1)
    expect(b.expectancy).toBeNull()
  })
})

// ── computeEmaBuckets — crossover aggregation (independent dimension) ─────────
describe('computeEmaBuckets — crossover aggregation', () => {
  it('(T8) aggregates stacked + broken sides with full BucketStats math', () => {
    const rows = [
      emaRow(1, 100, 0, true), // stacked
      emaRow(2, 200, 0, true), // stacked
      emaRow(3, 300, 0, true), // stacked
      emaRow(4, -100, 0, true), // stacked
      emaRow(5, -50, 0, false), // broken
      emaRow(6, 150, 0, false), // broken
    ]
    const r = computeEmaBuckets(rows, '1m')
    expect(r.crossover.stacked.n).toBe(4)
    expect(r.crossover.stacked.netPnl).toBe(500)
    expect(r.crossover.stacked.winRate).toBe(0.75)
    expect(r.crossover.stacked.avgWinner).toBe(200)
    expect(r.crossover.stacked.avgLoser).toBe(-100)
    expect(r.crossover.stacked.expectancy).toBeNull() // n=4 < 5
    expect(r.crossover.broken.n).toBe(2)
    expect(r.crossover.broken.netPnl).toBe(100)
    expect(r.crossover.broken.winRate).toBe(0.5)
    expect(r.crossover.broken.avgWinner).toBe(150)
    expect(r.crossover.broken.avgLoser).toBe(-50)
    // Distance dimension still partitions all 6 into e2 in parallel.
    expect(r.buckets.e2.n).toBe(6)
    expect(r.denominator).toBe(6)
  })

  it('(T9) crossover is independent of the distance partition', () => {
    const rows = [
      emaRow(1, 100, 0, null), // distance e2, crossover-null
      emaRow(2, 200, null, true), // distance-unclassified, crossover stacked
    ]
    const r = computeEmaBuckets(rows, '1m')
    // Distance axis: only row 1 lands in a bucket; row 2 is unclassified.
    expect(r.denominator).toBe(1)
    expect(r.buckets.e2.n).toBe(1)
    expect(r.buckets.e2.netPnl).toBe(100)
    expect(r.unclassified).toBe(1)
    // Crossover axis: only row 2 is stacked; row 1 feeds no side. The two axes
    // count different trades, so the membership genuinely diverges.
    expect(r.crossover.stacked.n).toBe(1)
    expect(r.crossover.stacked.netPnl).toBe(200)
    expect(r.crossover.broken.n).toBe(0)
  })
})

// ── rowsForEmaBucket ─────────────────────────────────────────────────────────
describe('rowsForEmaBucket', () => {
  it('(R1) empty input → [] for every bucket key', () => {
    for (const k of EMA_KEYS) expect(rowsForEmaBucket([], '1m', k)).toEqual([])
  })

  it('(R2) single e2 row → returned for e2, [] for e3', () => {
    const row = emaRow(1, 100, 0)
    expect(rowsForEmaBucket([row], '1m', 'e2')).toEqual([row])
    expect(rowsForEmaBucket([row], '1m', 'e3')).toEqual([])
  })

  it('(R3) gate-fail + unclassified rows never appear in any bucket', () => {
    const incomplete = makeCompleteSnapshot({ ema9_dist_pct: 0 })
    incomplete.data_complete = false
    const gateFailNull = makeRow({ id: 1, technicals: null })
    const gateFailIncomplete = makeRow({ id: 2, technicals: incomplete })
    const unclassified = emaRow(3, 0, null)
    const e2 = emaRow(4, 100, 0)
    const rows = [gateFailNull, gateFailIncomplete, unclassified, e2]
    const allBucketed = EMA_KEYS.flatMap((k) => rowsForEmaBucket(rows, '1m', k))
    expect(allBucketed).toEqual([e2])
    expect(allBucketed).not.toContain(gateFailNull)
    expect(allBucketed).not.toContain(gateFailIncomplete)
    expect(allBucketed).not.toContain(unclassified)
  })

  it('(R4) timeframe-dependent: same row resolves to different buckets per timeframe', () => {
    const tech = makeCompleteSnapshot(
      { ema9_dist_pct: 0 }, // 1m → e2
      { ema9_dist_pct: 15.0 }, // 5m → e6
    )
    const row = makeRow({ technicals: tech })
    expect(rowsForEmaBucket([row], '1m', 'e2')).toEqual([row])
    expect(rowsForEmaBucket([row], '5m', 'e6')).toEqual([row])
    expect(rowsForEmaBucket([row], '1m', 'e6')).toEqual([])
  })
})

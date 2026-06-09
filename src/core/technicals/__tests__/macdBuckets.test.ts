import { describe, it, expect } from 'vitest'
import { computeMacdBuckets } from '../macdBuckets'
import type { MacdBucketStats } from '../macdBuckets'
import type {
  TechnicalSnapshot,
  TradeTechnicalsRow,
  TradeWithTechnicalsRow,
} from '@shared/technicals-types'

// ── Fixtures ────────────────────────────────────────────────────────────────
// DEFAULT_TF: a classifiable snapshot that lands in the negFalling bucket
// (macd_positive false, macd_rising false). Tests override macd_positive /
// macd_rising to place a trade in a specific bucket, or set either to null to
// make the row unclassifiable. All other fields are plausible stubs the
// module never reads — mirrors the headerStrip.test.ts convention.
const DEFAULT_TF: TechnicalSnapshot = {
  macd_line: -0.1,
  signal_line: 0,
  histogram: -0.1,
  histogram_prior: -0.05,
  macd_positive: false,
  macd_open: false,
  macd_rising: false,
  vwap: 10.0,
  vwap_dist_pct: -1.0,
  ema9: 10.0,
  ema9_dist_pct: -1.0,
  ema20: 10.0,
  ema20_dist_pct: -1.0,
  ema9_above_ema20: false,
}

function makeCompleteSnapshot(
  tf1m: Partial<TechnicalSnapshot> = {},
  tf5m: Partial<TechnicalSnapshot> = {},
): TradeTechnicalsRow {
  return {
    trade_id: 1,
    tf_1m: { ...DEFAULT_TF, ...tf1m },
    tf_5m: { ...DEFAULT_TF, ...tf5m },
    data_complete: true,
    computed_at: '2026-05-15T13:30:00Z',
    schema_version: 1,
  }
}

function makeRow(
  overrides: {
    id?: number
    net_pnl?: number
    technicals?: TradeTechnicalsRow | null
  } = {},
): TradeWithTechnicalsRow {
  return {
    id: overrides.id ?? 1,
    symbol: 'TEST',
    date: '2026-05-15',
    side: 'long',
    net_pnl: overrides.net_pnl ?? 100,
    playbook_id: null,
    playbook_name: null,
    technicals:
      overrides.technicals === undefined
        ? makeCompleteSnapshot()
        : overrides.technicals,
  }
}

// A classifiable row placed in one bucket on the 1m timeframe by its
// (macd_positive, macd_rising) pair. tf_5m is left at DEFAULT (negFalling) —
// irrelevant to the 1m-timeframe tests, matching the headerStrip convention.
function bucketRow(
  id: number,
  net_pnl: number,
  pos: boolean,
  rising: boolean,
): TradeWithTechnicalsRow {
  return makeRow({
    id,
    net_pnl,
    technicals: makeCompleteSnapshot({ macd_positive: pos, macd_rising: rising }),
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

// Partition invariant — asserted in every test per the locked design: the
// classifiable denominator must equal the sum of the four bucket counts, so
// no trade is ever lost or double-counted across the 2×2 split.
function expectDenominatorInvariant(r: MacdBucketStats): void {
  expect(r.denominator).toBe(
    r.posRising.n + r.posFalling.n + r.negRising.n + r.negFalling.n,
  )
}

// ── Group 1: exclusion tiers ─────────────────────────────────────────────────

describe('computeMacdBuckets — exclusion tiers', () => {
  it('(T1) empty input → all tiers zero, all buckets empty', () => {
    const result = computeMacdBuckets([], '1m')
    expect(result).toEqual({
      excluded: 0,
      unclassified: 0,
      denominator: 0,
      posRising: EMPTY_BUCKET,
      posFalling: EMPTY_BUCKET,
      negRising: EMPTY_BUCKET,
      negFalling: EMPTY_BUCKET,
    })
    expectDenominatorInvariant(result)
  })

  it('(T2) all data-gate-fail (technicals null) → excluded = N, denominator 0', () => {
    const rows = [
      makeRow({ id: 1, technicals: null }),
      makeRow({ id: 2, technicals: null }),
      makeRow({ id: 3, technicals: null }),
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.excluded).toBe(3)
    expect(result.unclassified).toBe(0)
    expect(result.denominator).toBe(0)
    expect(result.posRising).toEqual(EMPTY_BUCKET)
    expect(result.posFalling).toEqual(EMPTY_BUCKET)
    expect(result.negRising).toEqual(EMPTY_BUCKET)
    expect(result.negFalling).toEqual(EMPTY_BUCKET)
    expectDenominatorInvariant(result)
  })

  it('(T3) data-complete but macd_positive null → unclassified, not excluded', () => {
    const rows = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: null }) }),
      makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_positive: null }) }),
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.excluded).toBe(0)
    expect(result.unclassified).toBe(2)
    expect(result.denominator).toBe(0)
    expectDenominatorInvariant(result)
  })

  it('(T4) data-complete but macd_rising null (§A3 first-bar) → unclassified', () => {
    const rows = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_rising: null }) }),
      makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_rising: null }) }),
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.excluded).toBe(0)
    expect(result.unclassified).toBe(2)
    expect(result.denominator).toBe(0)
    expectDenominatorInvariant(result)
  })

  it('(T5) mixed tiers → 2 excluded, 1 unclassified, 3 classifiable', () => {
    const incomplete = makeCompleteSnapshot()
    incomplete.data_complete = false
    const rows = [
      makeRow({ id: 1, technicals: null }), // gate fail (null)
      makeRow({ id: 2, technicals: incomplete }), // gate fail (incomplete)
      makeRow({ id: 3, technicals: makeCompleteSnapshot({ macd_rising: null }) }), // unclassified
      bucketRow(4, 100, true, true), // posRising
      bucketRow(5, 100, true, true), // posRising
      bucketRow(6, 100, true, true), // posRising
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.excluded).toBe(2)
    expect(result.unclassified).toBe(1)
    expect(result.denominator).toBe(3)
    expect(result.posRising.n).toBe(3)
    expect(result.posFalling).toEqual(EMPTY_BUCKET)
    expect(result.negRising).toEqual(EMPTY_BUCKET)
    expect(result.negFalling).toEqual(EMPTY_BUCKET)
    expectDenominatorInvariant(result)
  })
})

// ── Group 2: partition correctness (1m) ──────────────────────────────────────

describe('computeMacdBuckets — partition (1m)', () => {
  it('(T6) one trade per bucket → each n=1, denominator 4', () => {
    const rows = [
      bucketRow(1, 10, true, true), // posRising
      bucketRow(2, 20, true, false), // posFalling
      bucketRow(3, 30, false, true), // negRising
      bucketRow(4, 40, false, false), // negFalling
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.denominator).toBe(4)
    expect(result.excluded).toBe(0)
    expect(result.unclassified).toBe(0)
    expect(result.posRising.n).toBe(1)
    expect(result.posFalling.n).toBe(1)
    expect(result.negRising.n).toBe(1)
    expect(result.negFalling.n).toBe(1)
    // Distinct net_pnl per bucket proves each trade landed in the right cell.
    expect(result.posRising.netPnl).toBe(10)
    expect(result.posFalling.netPnl).toBe(20)
    expect(result.negRising.netPnl).toBe(30)
    expect(result.negFalling.netPnl).toBe(40)
    expectDenominatorInvariant(result)
  })

  it('(T7) two trades in posRising, others empty', () => {
    const rows = [
      bucketRow(1, 100, true, true),
      bucketRow(2, 200, true, true),
    ]
    const result = computeMacdBuckets(rows, '1m')
    expect(result.denominator).toBe(2)
    expect(result.posRising.n).toBe(2)
    expect(result.posFalling).toEqual(EMPTY_BUCKET)
    expect(result.negRising).toEqual(EMPTY_BUCKET)
    expect(result.negFalling).toEqual(EMPTY_BUCKET)
    expectDenominatorInvariant(result)
  })
})

// ── Group 3: timeframe selection ─────────────────────────────────────────────

describe('computeMacdBuckets — timeframe selection', () => {
  it('(T8) positive axis differs across timeframes → bucket follows the toggle', () => {
    // tf_1m: positive + rising → posRising. tf_5m: negative + rising → negRising.
    const tech = makeCompleteSnapshot(
      { macd_positive: true, macd_rising: true },
      { macd_positive: false, macd_rising: true },
    )
    const row = makeRow({ technicals: tech })

    const on1m = computeMacdBuckets([row], '1m')
    expect(on1m.posRising.n).toBe(1)
    expect(on1m.negRising.n).toBe(0)
    expectDenominatorInvariant(on1m)

    const on5m = computeMacdBuckets([row], '5m')
    expect(on5m.negRising.n).toBe(1)
    expect(on5m.posRising.n).toBe(0)
    expectDenominatorInvariant(on5m)
  })
})

// ── Group 4: per-bucket math ─────────────────────────────────────────────────

describe('computeMacdBuckets — per-bucket math', () => {
  it('(T9) winners + losers → winRate, avgs, expectancy = netPnl/n', () => {
    // 3 winners (100,200,300) + 2 losers (-50,-150) in posRising.
    const rows = [
      bucketRow(1, 100, true, true),
      bucketRow(2, 200, true, true),
      bucketRow(3, 300, true, true),
      bucketRow(4, -50, true, true),
      bucketRow(5, -150, true, true),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(0.6) // 3 / 5
    expect(b.netPnl).toBe(400) // 600 - 200
    expect(b.avgWinner).toBe(200) // 600 / 3
    expect(b.avgLoser).toBe(-100) // -200 / 2
    expect(b.expectancy).toBe(80) // 400 / 5  ≡ 0.6*200 + 0.4*(-100)
    expectDenominatorInvariant(result)
  })

  it('(T10) all breakevens → winRate 0, avgWinner null, avgLoser 0, expectancy 0', () => {
    const rows = [
      bucketRow(1, 0, true, false),
      bucketRow(2, 0, true, false),
      bucketRow(3, 0, true, false),
      bucketRow(4, 0, true, false),
      bucketRow(5, 0, true, false),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posFalling
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(0) // breakeven counts as loss
    expect(b.netPnl).toBe(0)
    expect(b.avgWinner).toBeNull() // no winners
    expect(b.avgLoser).toBe(0) // 5 breakevens, sum 0
    expect(b.expectancy).toBe(0) // 0 / 5
    expectDenominatorInvariant(result)
  })

  it('(T11) pure-loser bucket, n<5 → expectancy suppressed to null', () => {
    const rows = [
      bucketRow(1, -100, false, false),
      bucketRow(2, -200, false, false),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.negFalling
    expect(b.n).toBe(2)
    expect(b.winRate).toBe(0)
    expect(b.netPnl).toBe(-300)
    expect(b.avgWinner).toBeNull()
    expect(b.avgLoser).toBe(-150) // -300 / 2
    expect(b.expectancy).toBeNull() // n < 5
    expectDenominatorInvariant(result)
  })

  it('(T12) all-winners bucket (n≥5) → avgLoser null, expectancy = avgWinner', () => {
    const rows = [
      bucketRow(1, 100, true, true),
      bucketRow(2, 100, true, true),
      bucketRow(3, 100, true, true),
      bucketRow(4, 100, true, true),
      bucketRow(5, 100, true, true),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(5)
    expect(b.winRate).toBe(1)
    expect(b.netPnl).toBe(500)
    expect(b.avgWinner).toBe(100)
    expect(b.avgLoser).toBeNull() // no losers
    expect(b.expectancy).toBe(100) // 500 / 5  ≡ 1*100 + 0*(null→0)
    expectDenominatorInvariant(result)
  })

  it('(T13) mixed boundary: 2 winners + 1 breakeven → breakeven is a loser', () => {
    const rows = [
      bucketRow(1, 100, true, true),
      bucketRow(2, 50, true, true),
      bucketRow(3, 0, true, true),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(3)
    expect(b.winRate).toBe(2 / 3) // 2 winners; the breakeven is a loss
    expect(b.netPnl).toBe(150)
    expect(b.avgWinner).toBe(75) // 150 / 2
    expect(b.avgLoser).toBe(0) // the lone breakeven
    expect(b.expectancy).toBeNull() // n < 5
    expectDenominatorInvariant(result)
  })
})

// ── Group 5: expectancy suppression (§C:104) ─────────────────────────────────

describe('computeMacdBuckets — expectancy suppression', () => {
  it('(T14) n=4 → expectancy null, but winRate still shown', () => {
    const rows = [
      bucketRow(1, 100, true, true),
      bucketRow(2, 100, true, true),
      bucketRow(3, 100, true, true),
      bucketRow(4, 100, true, true),
    ]
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(4)
    expect(b.winRate).toBe(1) // NOT suppressed below 5 (unlike HeaderStrip)
    expect(b.expectancy).toBeNull() // suppressed below 5
    expectDenominatorInvariant(result)
  })

  it('(T15) n=5 → expectancy computed', () => {
    const rows = Array.from({ length: 5 }, (_, i) => bucketRow(i + 1, 100, true, true))
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(5)
    expect(b.expectancy).toBe(100) // 500 / 5
    expectDenominatorInvariant(result)
  })

  it('(T16) n=6 → expectancy computed', () => {
    const rows = Array.from({ length: 6 }, (_, i) => bucketRow(i + 1, 100, true, true))
    const result = computeMacdBuckets(rows, '1m')
    const b = result.posRising
    expect(b.n).toBe(6)
    expect(b.expectancy).toBe(100) // 600 / 6
    expectDenominatorInvariant(result)
  })
})

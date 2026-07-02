// Flagship Compare stats, Group 2 — exit-quality + behavioural metrics that
// extend PeriodMetrics (so they ride ComparisonResult.periodA/periodB into the
// Compare UI in a later beat):
//   A. MFE-capture %   — net_pnl / (mfe$/share * positionShares), per-trade mean
//   B. MAE-to-stop     — mae$/share / risk_per_share$/share, per-trade mean
//   C. R distribution  — fixed 7-bucket histogram of r_multiple
//   D. After big win/loss — next-trade P&L following a >= 2x-average trade
//
// All coverage-gated: null when no covered data, with a reported coverage count;
// never fabricated. mae/mfe are $/share (shared/trades-types.ts:35-39); A
// multiplies mfe by positionShares = max(shares_bought, shares_sold) to reach
// the favorable DOLLARS — it deliberately diverges from computeExcursionStats'
// avg_mfe_dollars, which is per-share (a misnomer), so mirroring it would be
// dimensionally wrong.

import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { DateRange } from '../types'
import { computePeriodMetrics } from '../metrics'

function tradeRow(overrides: Partial<TradeListRow>): TradeListRow {
  return {
    account_id: 'ACCT-MAIN',
    id: 0,
    date: '2026-05-11',
    symbol: 'TEST',
    side: 'long',
    open_time: '2026-05-11T09:30:00',
    close_time: '2026-05-11T09:45:00',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 1,
    shares_sold: 100,
    avg_sell_price: 1,
    gross_pnl: 0,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
    ...overrides,
  }
}

const RANGE: DateRange = { from: '2026-05-01', to: '2026-05-31' }

// All seven R buckets, in display order, every count 0 — the shape returned
// when no trade carries an r_multiple (buckets always present, like the
// Symbols bar cards rendering empty rows).
const EMPTY_DIST = [
  { bucket: '<= -2R', count: 0 },
  { bucket: '-2 to -1', count: 0 },
  { bucket: '-1 to 0', count: 0 },
  { bucket: '0 to 1', count: 0 },
  { bucket: '1 to 2', count: 0 },
  { bucket: '2 to 3', count: 0 },
  { bucket: '>= 3R', count: 0 },
]

// ── A. MFE-capture % ───────────────────────────────────────────────────────
describe('computePeriodMetrics — MFE-capture %', () => {
  // capture = net_pnl / (mfe * max(shares_bought, shares_sold)). Covered =
  // mfe != null && mfe > 0 && positionShares > 0.
  //   +100 / (1.0 * 100) =  1.0
  //   + 60 / (2.0 * 100) =  0.3
  //   - 40 / (0.5 * 100) = -0.8
  //   mfe null            -> uncovered (no intraday bars)
  //   mfe 0               -> uncovered (div-by-zero guard)
  //   + 90 / (1.0 * 100) =  0.9   (shares 100/50 -> max() = 100 pins positionShares)
  const FIXTURE: TradeListRow[] = [
    tradeRow({ net_pnl: 100, mfe: 1.0, shares_bought: 100, shares_sold: 100 }),
    tradeRow({ net_pnl: 60, mfe: 2.0, shares_bought: 100, shares_sold: 100 }),
    tradeRow({ net_pnl: -40, mfe: 0.5, shares_bought: 100, shares_sold: 100 }),
    tradeRow({ net_pnl: 20, mfe: null, shares_bought: 100, shares_sold: 100 }),
    tradeRow({ net_pnl: 10, mfe: 0, shares_bought: 100, shares_sold: 100 }),
    tradeRow({ net_pnl: 90, mfe: 1.0, shares_bought: 100, shares_sold: 50 }),
  ]

  it('per-trade mean capture over the covered subset + coverage count', () => {
    const m = computePeriodMetrics(FIXTURE, RANGE)
    expect(m.mfeCapturePct).toBeCloseTo(1.4 / 4, 10) // (1.0 + 0.3 - 0.8 + 0.9) / 4 = 0.35
    expect(m.mfeCaptureCoverage).toBe(4)
  })

  it('no mfe anywhere -> mfeCapturePct null, coverage 0', () => {
    const m = computePeriodMetrics(
      [tradeRow({ net_pnl: 100, mfe: null })],
      RANGE,
    )
    expect(m.mfeCapturePct).toBeNull()
    expect(m.mfeCaptureCoverage).toBe(0)
  })
})

// ── B. MAE-to-stop ─────────────────────────────────────────────────────────
describe('computePeriodMetrics — MAE-to-stop', () => {
  // ratio = mae / risk_per_share (both $/share). Covered = mae != null &&
  // risk_per_share != null && risk_per_share > 0.
  //   0.5 / 1.0 = 0.5
  //   2.0 / 1.0 = 2.0   (blew 2x past the stop)
  //   1.5 / 1.0 = 1.5
  //   mae null             -> uncovered (no intraday bars)
  //   risk_per_share null  -> uncovered (no stop logged)
  //   risk_per_share 0     -> uncovered (div-by-zero guard)
  const FIXTURE: TradeListRow[] = [
    tradeRow({ mae: 0.5, risk_per_share: 1.0 }),
    tradeRow({ mae: 2.0, risk_per_share: 1.0 }),
    tradeRow({ mae: 1.5, risk_per_share: 1.0 }),
    tradeRow({ mae: null, risk_per_share: 1.0 }),
    tradeRow({ mae: 1.0, risk_per_share: null }),
    tradeRow({ mae: 1.0, risk_per_share: 0 }),
  ]

  it('per-trade mean ratio over the doubly-covered subset + coverage count', () => {
    const m = computePeriodMetrics(FIXTURE, RANGE)
    expect(m.maeToStop).toBeCloseTo(4 / 3, 10) // (0.5 + 2.0 + 1.5) / 3
    expect(m.maeToStopCoverage).toBe(3)
  })

  it('no logged stop anywhere -> maeToStop null, coverage 0', () => {
    const m = computePeriodMetrics(
      [tradeRow({ mae: 1.0, risk_per_share: null })],
      RANGE,
    )
    expect(m.maeToStop).toBeNull()
    expect(m.maeToStopCoverage).toBe(0)
  })
})

// ── C. R-multiple distribution ─────────────────────────────────────────────
describe('computePeriodMetrics — R-multiple distribution', () => {
  // 13 covered + 1 null. Two values per bucket except '-1 to 0' (one).
  const FIXTURE: TradeListRow[] = [
    tradeRow({ r_multiple: -3.0 }),
    tradeRow({ r_multiple: -2.0 }),
    tradeRow({ r_multiple: -1.5 }),
    tradeRow({ r_multiple: -1.0 }),
    tradeRow({ r_multiple: -0.5 }),
    tradeRow({ r_multiple: 0.0 }),
    tradeRow({ r_multiple: 0.5 }),
    tradeRow({ r_multiple: 1.0 }),
    tradeRow({ r_multiple: 1.5 }),
    tradeRow({ r_multiple: 2.0 }),
    tradeRow({ r_multiple: 2.5 }),
    tradeRow({ r_multiple: 3.0 }),
    tradeRow({ r_multiple: 5.0 }),
    tradeRow({ r_multiple: null }),
  ]

  it('buckets every covered trade into the fixed 7-bucket histogram', () => {
    const m = computePeriodMetrics(FIXTURE, RANGE)
    expect(m.rDistribution).toEqual([
      { bucket: '<= -2R', count: 2 }, // -3.0, -2.0
      { bucket: '-2 to -1', count: 2 }, // -1.5, -1.0
      { bucket: '-1 to 0', count: 1 }, // -0.5
      { bucket: '0 to 1', count: 2 }, // 0.0, 0.5
      { bucket: '1 to 2', count: 2 }, // 1.0, 1.5
      { bucket: '2 to 3', count: 2 }, // 2.0, 2.5
      { bucket: '>= 3R', count: 2 }, // 3.0, 5.0
    ])
    expect(m.rDistCoverage).toBe(13)
  })

  // The boundary values are where off-by-one bucket bugs hide. Each exact
  // integer R must land in exactly one bucket per the documented edge rule:
  // negatives right-inclusive (lo, hi], non-negatives left-inclusive [lo, hi),
  // tails closed on their open end.
  it.each([
    [-2, '<= -2R'],
    [-1, '-2 to -1'],
    [0, '0 to 1'],
    [1, '1 to 2'],
    [2, '2 to 3'],
    [3, '>= 3R'],
  ])('boundary r=%d lands only in %s', (r, bucket) => {
    const m = computePeriodMetrics([tradeRow({ r_multiple: r })], RANGE)
    const nonEmpty = m.rDistribution.filter((b) => b.count > 0)
    expect(nonEmpty).toEqual([{ bucket, count: 1 }])
  })

  it('no r_multiple anywhere -> all seven buckets present at 0, coverage 0', () => {
    const m = computePeriodMetrics([tradeRow({ r_multiple: null })], RANGE)
    expect(m.rDistribution).toEqual(EMPTY_DIST)
    expect(m.rDistCoverage).toBe(0)
  })
})

// ── D. Performance after a big win / big loss ──────────────────────────────
describe('computePeriodMetrics — after big win / big loss', () => {
  // Period-calibrated thresholds (BIG_TRADE_MULTIPLE = 2):
  //   winners {200, 40, 60} -> avgWinner 100 -> big win >= 200
  //   losers {-40, -200, -60} -> avgLoser -100 -> big loss <= -200
  // Chronological order (open_time): the +200 big win is followed by -40; the
  // -200 big loss is followed by +60. Boundaries (exactly 2x) count as big.
  const FIXTURE: TradeListRow[] = [
    tradeRow({ open_time: '2026-05-10T13:30:00Z', date: '2026-05-10', net_pnl: 200 }),
    tradeRow({ open_time: '2026-05-10T13:31:00Z', date: '2026-05-10', net_pnl: -40 }),
    tradeRow({ open_time: '2026-05-10T13:32:00Z', date: '2026-05-10', net_pnl: 40 }),
    tradeRow({ open_time: '2026-05-10T13:33:00Z', date: '2026-05-10', net_pnl: -200 }),
    tradeRow({ open_time: '2026-05-10T13:34:00Z', date: '2026-05-10', net_pnl: 60 }),
    tradeRow({ open_time: '2026-05-10T13:35:00Z', date: '2026-05-10', net_pnl: -60 }),
  ]

  it('averages the next-trade P&L following each big win / big loss', () => {
    const m = computePeriodMetrics(FIXTURE, RANGE)
    expect(m.afterBigWinAvgPnl).toBeCloseTo(-40, 10) // follower of the +200
    expect(m.afterBigWinCount).toBe(1)
    expect(m.afterBigLossAvgPnl).toBeCloseTo(60, 10) // follower of the -200
    expect(m.afterBigLossCount).toBe(1)
  })

  it('a big win as the LAST trade has no follower -> excluded and uncounted', () => {
    // winners {40, 60, 200} -> avgWinner 100 -> +200 is big but is last.
    const m = computePeriodMetrics(
      [
        tradeRow({ open_time: '2026-05-10T13:30:00Z', date: '2026-05-10', net_pnl: 40 }),
        tradeRow({ open_time: '2026-05-10T13:31:00Z', date: '2026-05-10', net_pnl: 60 }),
        tradeRow({ open_time: '2026-05-10T13:32:00Z', date: '2026-05-10', net_pnl: 200 }),
      ],
      RANGE,
    )
    expect(m.afterBigWinAvgPnl).toBeNull()
    expect(m.afterBigWinCount).toBe(0)
    // No losers at all -> avgLoser null -> big-loss path null/0.
    expect(m.afterBigLossAvgPnl).toBeNull()
    expect(m.afterBigLossCount).toBe(0)
  })

  it('no winners -> after-big-win null/0; big loss still computes', () => {
    // losers only {-200, -40, -60} -> avgLoser -100 -> -200 big, follower -40.
    const m = computePeriodMetrics(
      [
        tradeRow({ open_time: '2026-05-10T13:30:00Z', date: '2026-05-10', net_pnl: -200 }),
        tradeRow({ open_time: '2026-05-10T13:31:00Z', date: '2026-05-10', net_pnl: -40 }),
        tradeRow({ open_time: '2026-05-10T13:32:00Z', date: '2026-05-10', net_pnl: -60 }),
      ],
      RANGE,
    )
    expect(m.afterBigWinAvgPnl).toBeNull()
    expect(m.afterBigWinCount).toBe(0)
    expect(m.afterBigLossAvgPnl).toBeCloseTo(-40, 10)
    expect(m.afterBigLossCount).toBe(1)
  })
})

// ── Zero-coverage / empty ──────────────────────────────────────────────────
describe('computePeriodMetrics — Group 2 zero-coverage honesty', () => {
  it('trades present but no mfe/stop/r and no big trades -> nulls + 0 counts', () => {
    const m = computePeriodMetrics(
      [
        tradeRow({ net_pnl: 5, mfe: null, mae: null, r_multiple: null }),
        tradeRow({ net_pnl: -5, mfe: null, mae: null, r_multiple: null }),
      ],
      RANGE,
    )
    expect(m.mfeCapturePct).toBeNull()
    expect(m.mfeCaptureCoverage).toBe(0)
    expect(m.maeToStop).toBeNull()
    expect(m.maeToStopCoverage).toBe(0)
    expect(m.rDistribution).toEqual(EMPTY_DIST)
    expect(m.rDistCoverage).toBe(0)
    expect(m.afterBigWinAvgPnl).toBeNull()
    expect(m.afterBigWinCount).toBe(0)
    expect(m.afterBigLossAvgPnl).toBeNull()
    expect(m.afterBigLossCount).toBe(0)
  })

  it('zero trades -> all Group 2 fields null / 0 / empty histogram', () => {
    const m = computePeriodMetrics([], RANGE)
    expect(m.mfeCapturePct).toBeNull()
    expect(m.mfeCaptureCoverage).toBe(0)
    expect(m.maeToStop).toBeNull()
    expect(m.maeToStopCoverage).toBe(0)
    expect(m.rDistribution).toEqual(EMPTY_DIST)
    expect(m.rDistCoverage).toBe(0)
    expect(m.afterBigWinAvgPnl).toBeNull()
    expect(m.afterBigWinCount).toBe(0)
    expect(m.afterBigLossAvgPnl).toBeNull()
    expect(m.afterBigLossCount).toBe(0)
  })
})

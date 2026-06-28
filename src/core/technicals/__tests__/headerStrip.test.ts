import { describe, it, expect } from 'vitest'
import { computeHeaderStrip } from '../headerStrip'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

// ── Fixtures ────────────────────────────────────────────────────────────────
// DEFAULT_TF / makeCompleteSnapshot / makeRow now live in @/test/fixtures/technicals (F2.0).

const EMPTY_CARD = { percent: null, winRate: null, netPnl: 0, n: 0 }

// ── Tests ─────────────────────────────────────────────────────────────────

describe('computeHeaderStrip — data gate', () => {
  it('(T1) empty input → all stats zeroed', () => {
    expect(computeHeaderStrip([], '1m')).toEqual({
      denominator: 0,
      vwapDenominator: 0,
      excluded: 0,
      macdPositive: EMPTY_CARD,
      aboveVwap: EMPTY_CARD,
      aboveEma9: EMPTY_CARD,
      fullAlignment: EMPTY_CARD,
    })
  })

  it('(T2) technicals: null → counted as excluded', () => {
    const result = computeHeaderStrip([makeRow({ technicals: null })], '1m')
    expect(result.denominator).toBe(0)
    expect(result.excluded).toBe(1)
    expect(result.macdPositive).toEqual(EMPTY_CARD)
    expect(result.aboveVwap).toEqual(EMPTY_CARD)
    expect(result.aboveEma9).toEqual(EMPTY_CARD)
    expect(result.fullAlignment).toEqual(EMPTY_CARD)
  })

  it('(T3) data_complete: false → counted as excluded', () => {
    const tech = makeCompleteSnapshot()
    tech.data_complete = false
    const result = computeHeaderStrip([makeRow({ technicals: tech })], '1m')
    expect(result.denominator).toBe(0)
    expect(result.excluded).toBe(1)
  })

  it('(T4) mixed gate → denominator 1, excluded 2', () => {
    const incomplete = makeCompleteSnapshot()
    incomplete.data_complete = false
    const rows = [
      makeRow({ id: 1, technicals: null }),
      makeRow({ id: 2, technicals: incomplete }),
      makeRow({ id: 3 }), // complete, all predicates false
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.denominator).toBe(1)
    expect(result.excluded).toBe(2)
  })
})

describe('computeHeaderStrip — predicates (1m timeframe)', () => {
  it('(T5) MACD positive predicate', () => {
    const rows = [
      makeRow({ id: 1, net_pnl: 200, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2, net_pnl: -50, technicals: makeCompleteSnapshot({ macd_positive: false }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.denominator).toBe(2)
    expect(result.macdPositive).toEqual({ percent: 50.0, winRate: null, netPnl: 200, n: 1 })
    expect(result.aboveVwap.n).toBe(0)
    expect(result.aboveEma9.n).toBe(0)
    expect(result.fullAlignment.n).toBe(0)
  })

  it('(T6) VWAP predicate', () => {
    const rows = [
      makeRow({ id: 1, net_pnl: 100, technicals: makeCompleteSnapshot({ vwap_dist_pct: 1.5 }) }),
      makeRow({ id: 2, net_pnl: -50, technicals: makeCompleteSnapshot({ vwap_dist_pct: -0.5 }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.aboveVwap.n).toBe(1)
    expect(result.macdPositive.n).toBe(0)
    expect(result.aboveEma9.n).toBe(0)
    expect(result.fullAlignment.n).toBe(0)
  })

  it('(T7) EMA9 predicate', () => {
    const rows = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ ema9_dist_pct: 0.8 }) }),
      makeRow({ id: 2, technicals: makeCompleteSnapshot({ ema9_dist_pct: -0.3 }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.aboveEma9.n).toBe(1)
    expect(result.aboveVwap.n).toBe(0)
    expect(result.macdPositive.n).toBe(0)
  })

  it('(T8) null vwap_dist_pct in a complete row → in denominator, not above', () => {
    const rows = [makeRow({ technicals: makeCompleteSnapshot({ vwap_dist_pct: null }) })]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.denominator).toBe(1)
    expect(result.aboveVwap.n).toBe(0)
  })
})

describe('computeHeaderStrip — fullAlignment', () => {
  it('(T9) fullAlignment is the AND of all three predicates', () => {
    const onlyMacd = makeCompleteSnapshot({ macd_positive: true })
    const onlyVwap = makeCompleteSnapshot({ vwap_dist_pct: 1.0 })
    const onlyEma = makeCompleteSnapshot({ ema9_dist_pct: 1.0 })
    const allThree = makeCompleteSnapshot({
      macd_positive: true,
      vwap_dist_pct: 1.0,
      ema9_dist_pct: 1.0,
    })
    const allFail = makeCompleteSnapshot()
    const rows = [
      makeRow({ id: 1, technicals: onlyMacd }),
      makeRow({ id: 2, technicals: onlyVwap }),
      makeRow({ id: 3, technicals: onlyEma }),
      makeRow({ id: 4, technicals: allThree }),
      makeRow({ id: 5, technicals: allFail }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.denominator).toBe(5)
    expect(result.fullAlignment.n).toBe(1)
    expect(result.macdPositive.n).toBe(2)
    expect(result.aboveVwap.n).toBe(2)
    expect(result.aboveEma9.n).toBe(2)
  })
})

describe('computeHeaderStrip — timeframe toggle', () => {
  it('(T10) timeframe selection reads the right snapshot', () => {
    const tech = makeCompleteSnapshot({ macd_positive: true }, { macd_positive: false })
    const row = makeRow({ technicals: tech })
    expect(computeHeaderStrip([row], '1m').macdPositive.n).toBe(1)
    expect(computeHeaderStrip([row], '5m').macdPositive.n).toBe(0)
  })
})

describe('computeHeaderStrip — winRate suppression', () => {
  it('(T11) winRate is null below n=5', () => {
    const rows = [
      makeRow({ id: 1, net_pnl: 100, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2, net_pnl: -50, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 3, net_pnl: 30, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 4, net_pnl: -10, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.macdPositive.n).toBe(4)
    expect(result.macdPositive.winRate).toBeNull()
    expect(result.macdPositive.netPnl).toBe(70) // 100 - 50 + 30 - 10
  })

  it('(T12) winRate computed at n=5', () => {
    const rows = [
      makeRow({ id: 1, net_pnl: 100, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2, net_pnl: 50, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 3, net_pnl: 30, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 4, net_pnl: -40, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 5, net_pnl: -20, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.macdPositive.n).toBe(5)
    expect(result.macdPositive.winRate).toBe(0.6) // 3 winners / 5
    expect(result.macdPositive.netPnl).toBe(120) // 100 + 50 + 30 - 40 - 20
  })

  it('(T13) winRate breakeven counts as loss', () => {
    const rows = [
      makeRow({ id: 1, net_pnl: 100, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2, net_pnl: 50, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 3, net_pnl: -30, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 4, net_pnl: -40, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 5, net_pnl: 0, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.macdPositive.winRate).toBe(0.4) // 2 winners / 5; breakeven is loss
  })
})

describe('computeHeaderStrip — percent edge cases', () => {
  it('(T14) percent rounded to 1 decimal', () => {
    // 3 rows, 1 matching → 33.3
    const three = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2 }),
      makeRow({ id: 3 }),
    ]
    expect(computeHeaderStrip(three, '1m').macdPositive.percent).toBe(33.3)

    // 6 rows, 2 matching → 33.3
    const six = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 3 }),
      makeRow({ id: 4 }),
      makeRow({ id: 5 }),
      makeRow({ id: 6 }),
    ]
    expect(computeHeaderStrip(six, '1m').macdPositive.percent).toBe(33.3)

    // 7 rows, 1 matching → 14.3
    const seven = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true }) }),
      makeRow({ id: 2 }),
      makeRow({ id: 3 }),
      makeRow({ id: 4 }),
      makeRow({ id: 5 }),
      makeRow({ id: 6 }),
      makeRow({ id: 7 }),
    ]
    expect(computeHeaderStrip(seven, '1m').macdPositive.percent).toBe(14.3)
  })
})

describe('computeHeaderStrip — fullAlignment pre-market amendment', () => {
  it('pre-market entry: macd + 9EMA aligned, VWAP null → counted in fullAlignment', () => {
    const snap = makeCompleteSnapshot({ macd_positive: true, vwap_dist_pct: null, ema9_dist_pct: 1.0 })
    const row = makeRow({ technicals: snap, open_time: '2026-05-15T13:00:00.000Z' }) // 09:00 ET
    const result = computeHeaderStrip([row], '1m')
    expect(result.fullAlignment.n).toBe(1)
    expect(result.aboveVwap.n).toBe(0) // the individual VWAP card still reads "not above" (null)
  })
  it('regular hours with the SAME null-VWAP snapshot → not fully aligned', () => {
    const snap = makeCompleteSnapshot({ macd_positive: true, vwap_dist_pct: null, ema9_dist_pct: 1.0 })
    const row = makeRow({ technicals: snap, open_time: '2026-05-15T13:45:00.000Z' }) // 09:45 ET
    expect(computeHeaderStrip([row], '1m').fullAlignment.n).toBe(0)
  })
})

describe('computeHeaderStrip — VWAP card coverage denominator (v0.2.5 fix)', () => {
  // A 10-trade, all-data-complete, all-regular-hours fixture that exercises the
  // VWAP split AND the three shared-denominator cards at once:
  //   - VWAP above (vwap_dist_pct > 0): rows 1,2,4,5             → 4
  //   - VWAP below, non-null:           row 6                    → 1
  //   - VWAP null (pre-session entry, no RTH VWAP): rows 3,7-10  → 5
  //     → vwapDenominator = 5 (non-null only), aboveVwap.n = 4   → 80.0%
  //   - MACD positive:                  rows 1,2,3               → 3 → 30.0% of 10
  //   - above 9 EMA (ema9_dist_pct > 0): rows 1,3               → 2 → 20.0% of 10
  //   - fully aligned (macd & vwap>0 & ema9>0, RTH): row 1      → 1 → 10.0% of 10
  const TEN = [
    makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true, vwap_dist_pct: 1.5, ema9_dist_pct: 1.0 }) }),
    makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_positive: true, vwap_dist_pct: 2.0, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 3, technicals: makeCompleteSnapshot({ macd_positive: true, vwap_dist_pct: null, ema9_dist_pct: 1.0 }) }),
    makeRow({ id: 4, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: 1.0, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 5, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: 3.0, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 6, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: -0.5, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 7, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: null, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 8, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: null, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 9, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: null, ema9_dist_pct: -1.0 }) }),
    makeRow({ id: 10, technicals: makeCompleteSnapshot({ macd_positive: false, vwap_dist_pct: null, ema9_dist_pct: -1.0 }) }),
  ]

  it('(Test A) VWAP card % divides by the non-null-VWAP denominator, not the shared one', () => {
    const result = computeHeaderStrip(TEN, '1m')
    // 4 above ÷ 5 with-VWAP-data = 80.0%, NOT 4 ÷ 10 data-complete = 40.0%.
    expect(result.aboveVwap.percent).toBe(80.0)
    expect(result.aboveVwap.n).toBe(4)
    expect(result.vwapDenominator).toBe(5)
    expect(result.denominator).toBe(10) // shared gate denominator unchanged
  })

  it('(Test C) vwap===0 counts in the VWAP denominator but not the numerator; null is excluded from it', () => {
    const rows = [
      makeRow({ id: 1, technicals: makeCompleteSnapshot({ vwap_dist_pct: 1.0 }) }), // above → denom + numerator
      makeRow({ id: 2, technicals: makeCompleteSnapshot({ vwap_dist_pct: 0 }) }), // exactly at → denom, NOT numerator
      makeRow({ id: 3, technicals: makeCompleteSnapshot({ vwap_dist_pct: null }) }), // no data → excluded from denom
    ]
    const result = computeHeaderStrip(rows, '1m')
    expect(result.vwapDenominator).toBe(2) // the >0 and the ===0; null excluded
    expect(result.aboveVwap.n).toBe(1) // only the >0 (===0 is not "above")
    expect(result.aboveVwap.percent).toBe(50.0) // 1 ÷ 2
    expect(result.denominator).toBe(3) // all three are data-complete
  })

  it('(Test D) regression: MACD / EMA9 / Discipline cards still divide by the full data-complete denominator (10)', () => {
    const result = computeHeaderStrip(TEN, '1m')
    expect(result.denominator).toBe(10)
    expect(result.macdPositive.percent).toBe(30.0) // 3 ÷ 10 — unchanged by this fix
    expect(result.aboveEma9.percent).toBe(20.0) // 2 ÷ 10 — unchanged by this fix
    expect(result.fullAlignment.percent).toBe(10.0) // 1 ÷ 10 — unchanged by this fix
  })
})

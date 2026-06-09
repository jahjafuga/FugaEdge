import { describe, it, expect } from 'vitest'
import { computeHeaderStrip } from '../headerStrip'
import type {
  TechnicalSnapshot,
  TradeTechnicalsRow,
  TradeWithTechnicalsRow,
} from '@shared/technicals-types'

// ── Fixtures ────────────────────────────────────────────────────────────────
// DEFAULT_TF: every predicate fails (macd_positive false, vwap/ema9 distances
// negative). Tests override only the field(s) under test, so a row "matches"
// a predicate only when explicitly flipped.
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

const EMPTY_CARD = { percent: null, winRate: null, netPnl: 0, n: 0 }

// ── Tests ─────────────────────────────────────────────────────────────────

describe('computeHeaderStrip — data gate', () => {
  it('(T1) empty input → all stats zeroed', () => {
    expect(computeHeaderStrip([], '1m')).toEqual({
      denominator: 0,
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

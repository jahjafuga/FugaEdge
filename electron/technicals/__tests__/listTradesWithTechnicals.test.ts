import { describe, it, expect, vi, beforeEach } from 'vitest'

// Two-pattern test file (matches the Commit 2 RED plan):
//   - mapTradeWithTechnicalsDbRow: PURE mapper tests on synthetic *DbRow
//     inputs, no DB (mirrors repo.test.ts's mapDbRowToParsed coverage).
//   - listTradesWithTechnicals: SQL-CONTRACT tests via the capturing-shim
//     pattern from electron/db/__tests__/read-paths-deleted-filter.test.ts.
//     better-sqlite3's native binary won't load under vitest, so there is no
//     real DB — we mock openDatabase, capture the prepared SQL + bound params,
//     and assert the contract. Behavioral filtering/ordering is covered by
//     integration when the TA tab lands (same split repo.test.ts chose).

// ── Capturing DB shim ───────────────────────────────────────────────────────
// Extends the read-paths shim with two channels: prepared SQL strings AND the
// params passed to all(). seededRows lets a test drive the result set.
let capturedSql: string[] = []
let capturedParams: unknown[][] = []
let seededRows: unknown[] = []

const stmt: any = {
  all: (...params: unknown[]) => {
    capturedParams.push(params)
    return seededRows
  },
  get: () => undefined,
  run: () => ({ changes: 0, lastInsertRowid: 0 }),
}

const capturingDb: any = {
  prepare: (sql: string) => {
    capturedSql.push(sql)
    return stmt
  },
}

// repo.ts imports openDatabase from '../db/database'; from this test file that
// module is '../../db/database'. Mocking it keeps the real better-sqlite3-backed
// module from loading. openDatabase is referenced lazily (only called in a test
// body), so capturingDb is initialized by then — no TDZ despite vi.mock hoist.
vi.mock('../../db/database', () => ({
  openDatabase: () => capturingDb,
}))

// SUT imported after the mock.
import {
  mapTradeWithTechnicalsDbRow,
  listTradesWithTechnicals,
  type TradeWithTechnicalsDbRow,
} from '../repo'

beforeEach(() => {
  capturedSql = []
  capturedParams = []
  seededRows = []
})

// ── Fixtures ────────────────────────────────────────────────────────────────
// A fully-populated joined row: tf_1m booleans all 1 (→ true), tf_5m booleans
// all 0 (→ false) so the decode is exercised both ways; every REAL column
// distinct so the pass-through is verifiable. Mirrors repo.test.ts's FULL_ROW.
const FULL_JOINED_ROW: TradeWithTechnicalsDbRow = {
  id: 100,
  symbol: 'AAA',
  date: '2026-05-15',
  side: 'long',
  net_pnl: 250.5,
  playbook_id: 7,
  playbook_name: 'Bull Flag',

  tt_trade_id: 100,
  tf_1m_macd_line: 0.5,
  tf_1m_signal_line: 0.3,
  tf_1m_histogram: 0.2,
  tf_1m_histogram_prior: 0.1,
  tf_1m_macd_positive: 1,
  tf_1m_macd_open: 1,
  tf_1m_macd_rising: 1,
  tf_1m_vwap: 10.5,
  tf_1m_vwap_dist_pct: 2.0,
  tf_1m_ema9: 10.1,
  tf_1m_ema9_dist_pct: 1.0,
  tf_1m_ema20: 10.0,
  tf_1m_ema20_dist_pct: 1.5,
  tf_1m_ema9_above_ema20: 1,

  tf_5m_macd_line: -0.4,
  tf_5m_signal_line: -0.2,
  tf_5m_histogram: -0.2,
  tf_5m_histogram_prior: -0.1,
  tf_5m_macd_positive: 0,
  tf_5m_macd_open: 0,
  tf_5m_macd_rising: 0,
  tf_5m_vwap: 11.0,
  tf_5m_vwap_dist_pct: -1.0,
  tf_5m_ema9: 11.2,
  tf_5m_ema9_dist_pct: -0.5,
  tf_5m_ema20: 11.5,
  tf_5m_ema20_dist_pct: -0.8,
  tf_5m_ema9_above_ema20: 0,

  data_complete: 1,
  computed_at: '2026-06-08T12:00:00Z',
  schema_version: 1,
}

// All 28 indicator columns null — the incomplete-but-row-exists case
// (makeIncompleteTechnicals output reaching the mapper). tt_trade_id stays set.
const NULL_INDICATORS: Partial<TradeWithTechnicalsDbRow> = {
  tf_1m_macd_line: null,
  tf_1m_signal_line: null,
  tf_1m_histogram: null,
  tf_1m_histogram_prior: null,
  tf_1m_macd_positive: null,
  tf_1m_macd_open: null,
  tf_1m_macd_rising: null,
  tf_1m_vwap: null,
  tf_1m_vwap_dist_pct: null,
  tf_1m_ema9: null,
  tf_1m_ema9_dist_pct: null,
  tf_1m_ema20: null,
  tf_1m_ema20_dist_pct: null,
  tf_1m_ema9_above_ema20: null,
  tf_5m_macd_line: null,
  tf_5m_signal_line: null,
  tf_5m_histogram: null,
  tf_5m_histogram_prior: null,
  tf_5m_macd_positive: null,
  tf_5m_macd_open: null,
  tf_5m_macd_rising: null,
  tf_5m_vwap: null,
  tf_5m_vwap_dist_pct: null,
  tf_5m_ema9: null,
  tf_5m_ema9_dist_pct: null,
  tf_5m_ema20: null,
  tf_5m_ema20_dist_pct: null,
  tf_5m_ema9_above_ema20: null,
}

function buildJoinedRow(
  overrides: Partial<TradeWithTechnicalsDbRow> = {},
): TradeWithTechnicalsDbRow {
  return { ...FULL_JOINED_ROW, ...overrides }
}

// ── Pure-mapper tests ───────────────────────────────────────────────────────

describe('mapTradeWithTechnicalsDbRow', () => {
  it('(P1) tt_trade_id null → technicals null; trade context from the row', () => {
    const out = mapTradeWithTechnicalsDbRow(
      buildJoinedRow({
        id: 42,
        symbol: 'BBB',
        date: '2026-05-10',
        side: 'short',
        net_pnl: -80,
        tt_trade_id: null,
      }),
    )
    expect(out.technicals).toBeNull()
    expect(out.id).toBe(42)
    expect(out.symbol).toBe('BBB')
    expect(out.date).toBe('2026-05-10')
    expect(out.side).toBe('short')
    expect(out.net_pnl).toBe(-80)
  })

  it('(P2) tt_trade_id set, all fields populated → technicals parsed, booleans decoded', () => {
    const out = mapTradeWithTechnicalsDbRow(buildJoinedRow())
    expect(out.technicals).not.toBeNull()
    expect(out.technicals!.data_complete).toBe(true)
    expect(out.technicals!.tf_1m.macd_positive).toBe(true)
    expect(out.technicals!.tf_1m.vwap_dist_pct).toBe(2.0)
    expect(out.technicals!.tf_5m.ema9_above_ema20).toBe(false)
  })

  it('(P3) tt_trade_id set, all indicators null, data_complete 0 → technicals present, fields null', () => {
    const out = mapTradeWithTechnicalsDbRow(
      buildJoinedRow({ ...NULL_INDICATORS, data_complete: 0 }),
    )
    expect(out.technicals).not.toBeNull()
    expect(out.technicals!.data_complete).toBe(false)
    expect(out.technicals!.tf_1m.macd_line).toBeNull()
    expect(out.technicals!.tf_5m.macd_positive).toBeNull()
  })

  it('(P4) playbook populated → passthrough', () => {
    const out = mapTradeWithTechnicalsDbRow(
      buildJoinedRow({ playbook_id: 7, playbook_name: 'Bull Flag' }),
    )
    expect(out.playbook_id).toBe(7)
    expect(out.playbook_name).toBe('Bull Flag')
  })

  it('(P5) playbook null → passthrough null', () => {
    const out = mapTradeWithTechnicalsDbRow(
      buildJoinedRow({ playbook_id: null, playbook_name: null }),
    )
    expect(out.playbook_id).toBeNull()
    expect(out.playbook_name).toBeNull()
  })
})

// ── SQL-contract tests (capturing shim) ─────────────────────────────────────

describe('listTradesWithTechnicals', () => {
  it('(S1) empty result set → []', () => {
    seededRows = []
    expect(listTradesWithTechnicals()).toEqual([])
  })

  it('(S2) always filters deleted_at IS NULL', () => {
    listTradesWithTechnicals()
    expect(capturedSql.length).toBeGreaterThan(0)
    expect(capturedSql[0]).toMatch(/t\.deleted_at\s+IS\s+NULL/i)
  })

  it('(S3) no date range → no date predicate, empty params', () => {
    listTradesWithTechnicals({})
    expect(capturedSql[0]).not.toMatch(/t\.date\s*>=/i)
    expect(capturedSql[0]).not.toMatch(/t\.date\s*<=/i)
    expect(capturedParams[0]).toEqual([])
  })

  it('(S4) full date range → both predicates + bound params in order', () => {
    listTradesWithTechnicals({ from: '2026-05-12', to: '2026-05-18' })
    expect(capturedSql[0]).toMatch(/t\.date\s*>=\s*\?/i)
    expect(capturedSql[0]).toMatch(/t\.date\s*<=\s*\?/i)
    expect(capturedParams[0]).toEqual(['2026-05-12', '2026-05-18'])
  })

  it('(S5) partial range (from-only OR to-only) → silently ignored, empty params', () => {
    listTradesWithTechnicals({ from: '2026-05-12' })
    expect(capturedSql[0]).not.toMatch(/t\.date\s*>=/i)
    expect(capturedParams[0]).toEqual([])

    listTradesWithTechnicals({ to: '2026-05-18' })
    expect(capturedSql[1]).not.toMatch(/t\.date\s*<=/i)
    expect(capturedParams[1]).toEqual([])
  })

  it('(S6) ordering by date DESC, then open_time DESC', () => {
    listTradesWithTechnicals()
    expect(capturedSql[0]).toMatch(/ORDER BY\s+t\.date\s+DESC/i)
    expect(capturedSql[0]).toMatch(/open_time\s+DESC/i)
  })
})

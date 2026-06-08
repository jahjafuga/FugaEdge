import { describe, it, expect } from 'vitest'
import {
  parseBool,
  encodeBool,
  mapDbRowToParsed,
  type TradeTechnicalsDbRow,
} from '../repo'

// NOTE: the DB-touching functions (getTradeTechnicals, upsertTradeTechnicals,
// getStaleTradeIds) are exercised via integration tests when the lazy-guard
// hook lands in Commit 4 — vitest can't load better-sqlite3 natively, so this
// file only covers the pure helpers (parseBool, encodeBool, mapDbRowToParsed).

// A full synthetic raw DB row. tf_1m booleans are all 1 (→ true), tf_5m
// booleans all 0 (→ false), so the decode is exercised in both directions.
// Every REAL column carries a distinct value so the pass-through is verifiable.
const FULL_ROW: TradeTechnicalsDbRow = {
  trade_id: 12345,

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

// All 28 indicator columns null (legacy / un-locatable snapshot).
const NULL_INDICATORS: Partial<TradeTechnicalsDbRow> = {
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

function dbRow(overrides: Partial<TradeTechnicalsDbRow> = {}): TradeTechnicalsDbRow {
  return { ...FULL_ROW, ...overrides }
}

describe('trade_technicals repo — pure helpers', () => {
  it('(1) parseBool decodes a nullable INTEGER boolean', () => {
    expect(parseBool(null)).toBeNull()
    expect(parseBool(undefined)).toBeNull()
    expect(parseBool(0)).toBe(false)
    expect(parseBool(1)).toBe(true)
    expect(parseBool(42)).toBe(true) // any non-zero → true
  })

  it('(2) encodeBool encodes a nullable boolean to INTEGER', () => {
    expect(encodeBool(null)).toBeNull()
    expect(encodeBool(undefined)).toBeNull()
    expect(encodeBool(true)).toBe(1)
    expect(encodeBool(false)).toBe(0)
  })

  it('(3) mapDbRowToParsed maps a full row: booleans decoded, reals passed through', () => {
    expect(mapDbRowToParsed(FULL_ROW)).toEqual({
      trade_id: 12345,
      tf_1m: {
        macd_line: 0.5,
        signal_line: 0.3,
        histogram: 0.2,
        histogram_prior: 0.1,
        macd_positive: true,
        macd_open: true,
        macd_rising: true,
        vwap: 10.5,
        vwap_dist_pct: 2.0,
        ema9: 10.1,
        ema9_dist_pct: 1.0,
        ema20: 10.0,
        ema20_dist_pct: 1.5,
        ema9_above_ema20: true,
      },
      tf_5m: {
        macd_line: -0.4,
        signal_line: -0.2,
        histogram: -0.2,
        histogram_prior: -0.1,
        macd_positive: false,
        macd_open: false,
        macd_rising: false,
        vwap: 11.0,
        vwap_dist_pct: -1.0,
        ema9: 11.2,
        ema9_dist_pct: -0.5,
        ema20: 11.5,
        ema20_dist_pct: -0.8,
        ema9_above_ema20: false,
      },
      data_complete: true,
      computed_at: '2026-06-08T12:00:00Z',
      schema_version: 1,
    })
  })

  it('(4) mapDbRowToParsed maps all-null indicator columns to all-null snapshots', () => {
    const parsed = mapDbRowToParsed(dbRow(NULL_INDICATORS))
    const allNull = {
      macd_line: null,
      signal_line: null,
      histogram: null,
      histogram_prior: null,
      macd_positive: null,
      macd_open: null,
      macd_rising: null,
      vwap: null,
      vwap_dist_pct: null,
      ema9: null,
      ema9_dist_pct: null,
      ema20: null,
      ema20_dist_pct: null,
      ema9_above_ema20: null,
    }
    expect(parsed.tf_1m).toEqual(allNull)
    expect(parsed.tf_5m).toEqual(allNull)
    // metadata still decodes normally
    expect(parsed.trade_id).toBe(12345)
  })

  it('(5) mapDbRowToParsed decodes data_complete INTEGER to boolean', () => {
    expect(mapDbRowToParsed(dbRow({ data_complete: 0 })).data_complete).toBe(false)
    expect(mapDbRowToParsed(dbRow({ data_complete: 1 })).data_complete).toBe(true)
  })
})

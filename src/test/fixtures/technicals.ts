// Shared test fixtures — per-timeframe technicals snapshot + the bulk-reader
// row builder. Extracted (F2.0) from the byte-identical local copies in
// macdBuckets.test.ts and headerStrip.test.ts so aggregation + component tests
// share one source. Pure data builders — no test-runner imports.

import type {
  TechnicalSnapshot,
  TradeTechnicalsRow,
  TradeWithTechnicalsRow,
} from '@shared/technicals-types'

// DEFAULT_TF: a classifiable snapshot that lands in the negFalling bucket
// (macd_positive false, macd_rising false). Tests override macd_positive /
// macd_rising to place a trade in a specific bucket, or set either to null to
// make the row unclassifiable. All other fields are plausible stubs the
// module never reads — mirrors the headerStrip.test.ts convention.
export const DEFAULT_TF: TechnicalSnapshot = {
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

export function makeCompleteSnapshot(
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

export function makeRow(
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

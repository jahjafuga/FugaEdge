// Shared test fixture — full TradeListRow builder (Variant 1: static id, AAPL
// defaults). Extracted (F2.0) from TradeDetailModal.lifecycle.test.tsx so the
// F2.1 TradeDetailSheet test (and future component tests) share one source.
// Note: TradesTable.bulk / TrashSection use a separate Variant-2 builder
// (nextId++ ids, AAA/0 defaults); reconciling the two is a deferred cleanup.

import type { TradeListRow } from '@shared/trades-types'

export function makeTrade(overrides: Partial<TradeListRow> = {}): TradeListRow {
  return {
    id: 1,
    date: '2026-05-20',
    symbol: 'AAPL',
    side: 'long',
    open_time: '2026-05-20T13:30:00.000Z',
    close_time: '2026-05-20T14:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 2,
    net_pnl: 98,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
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
    deleted_at: null,
    ...overrides,
  }
}

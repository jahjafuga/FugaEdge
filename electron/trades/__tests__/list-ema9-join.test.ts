// BEAT 1 — ENTRY vs 9EMA: the projection JOIN.
//
// listTrades/getTrade now LEFT JOIN trade_technicals and SELECT the 1-minute
// snapshot (tt.tf_1m_ema9_dist_pct) onto the row, so the Modal's tile reads the
// union-seeded value synchronously (no stale column, no async fetch, no loading
// flash). LEFT (not INNER): a trade with no technicals row → NULL → the tile's
// em-dash/pending path. Reads the 1m field specifically (matches the 1m chart),
// NOT tf_5m.
//
// SQL-contract + mapper test — better-sqlite3's native binary won't load under
// vitest, so openDatabase is a capturing shim (same idiom as list-commission.test.ts).
import { describe, expect, it, beforeEach, vi } from 'vitest'

let captured: string[] = []
let nextRows: Record<string, unknown>[] = []

const capturingDb = {
  prepare: (sql: string) => {
    captured.push(sql)
    return {
      all: () => nextRows,
      get: () => nextRows[0] ?? null,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => capturingDb }))

import { listTrades, getTrade } from '../list'

// A complete TradeRowDb-shaped row so the mapper's risk/executions/mistake-tag
// parsing runs without throwing on synthetic data. entry_ema9_distance_pct is the
// STALE day-only column (10.75); tf_1m_ema9_dist_pct is the union snapshot (3.66).
function fakeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, date: '2026-05-01', symbol: 'RDGT', side: 'long',
    open_time: '2026-05-01T13:30:00Z', close_time: '2026-05-01T13:35:00Z', is_open: 0,
    shares_bought: 1, avg_buy_price: 2.89, shares_sold: 1, avg_sell_price: 2.92,
    gross_pnl: 0.03, total_fees: 0.15, commission: 0.1, net_pnl: -0.12,
    executions_json: '[]',
    entry_timeframe: null,
    entry_ema9_distance_pct: 10.75, // stale day-only column
    tf_1m_ema9_dist_pct: 3.66, // union snapshot (1m)
    mae: null, mfe: null, daily_change_pct: null, rvol: null,
    playbook_id: null, playbook_name: null, playbook_tier: null,
    confidence: null, planned_risk: null, planned_stop_loss_price: null,
    float_shares: null, shares_outstanding: null,
    catalyst_type: null, days_since_catalyst: null,
    country: null, country_name: null, region: null, country_source: null,
    note_text: null, attachment_count: 0, secondary_tag_count: 0,
    mistake_link_count: 0, mistake_tags_json: null,
    deleted_at: null, account_id: 'ACCT-MAIN',
    ...over,
  }
}

beforeEach(() => {
  captured = []
  nextRows = []
})

describe('the 1m EMA9 snapshot threads through the trades read path', () => {
  it('listTrades LEFT JOINs trade_technicals and SELECTs the 1m field', () => {
    nextRows = [fakeRow()]
    listTrades()
    const sql = captured.find((s) => /tf_1m_ema9_dist_pct/i.test(s))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/LEFT JOIN\s+trade_technicals/i)
    expect(sql!).toMatch(/\btf_1m_ema9_dist_pct\b/i)
  })

  it('getTrade LEFT JOINs trade_technicals and SELECTs the 1m field', () => {
    nextRows = [fakeRow()]
    getTrade(1)
    const sql = captured.find((s) => /tf_1m_ema9_dist_pct/i.test(s))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/LEFT JOIN\s+trade_technicals/i)
  })

  it('listTrades maps the 1m snapshot onto the row (RDGT: 3.66 union seed) — not the 5m, not the stale column', () => {
    nextRows = [
      fakeRow({ tf_1m_ema9_dist_pct: 3.66, tf_5m_ema9_dist_pct: 9.99, entry_ema9_distance_pct: 10.75 }),
    ]
    const out = listTrades()
    expect(out[0].tf_1m_ema9_dist_pct).toBe(3.66)
  })

  it('getTrade maps a NULL snapshot to null (LEFT JOIN miss / incomplete stub), not undefined-by-omission', () => {
    nextRows = [fakeRow({ tf_1m_ema9_dist_pct: null })]
    const out = getTrade(1)
    expect(out).not.toBeNull()
    expect(out!.tf_1m_ema9_dist_pct).toBeNull()
  })
})

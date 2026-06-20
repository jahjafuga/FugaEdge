// Commission display beat — the data-path gap. Beat 3c added trades.commission
// (column + RoundTrip binding + TradeListRow type) but NOT the read path, so
// commission reached the renderer as undefined for every trade. These tests pin
// that listTrades/getTrade now SELECT commission and map it onto the row,
// including the NULL (DAS/Webull) case → null, not undefined-by-omission.
//
// SQL-contract + mapper test: better-sqlite3's native binary won't load under
// vitest, so openDatabase is mocked with a capturing shim that returns a real
// fake row (same idiom as read-paths-deleted-filter.test.ts).

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

// A complete TradeRowDb-shaped row so the mapper's computeRiskBreakdown /
// parseExecutions / etc. run without throwing on synthetic data.
function fakeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, date: '2026-05-01', symbol: 'XXII', side: 'long',
    open_time: '2026-05-01T13:30:00Z', close_time: '2026-05-01T13:35:00Z', is_open: 0,
    shares_bought: 1, avg_buy_price: 2.89, shares_sold: 1, avg_sell_price: 2.92,
    gross_pnl: 0.03, total_fees: 0.15, net_pnl: -0.12,
    commission: 0.1,
    executions_json: '[]',
    entry_timeframe: null, entry_ema9_distance_pct: null, mae: null, mfe: null,
    daily_change_pct: null, rvol: null,
    playbook_id: null, playbook_name: null, playbook_tier: null,
    confidence: null, mistakes_json: null, planned_risk: null, planned_stop_loss_price: null,
    float_shares: null, shares_outstanding: null,
    catalyst_type: null, days_since_catalyst: null,
    country: null, country_name: null, region: null, country_source: null,
    note_text: null, attachment_count: 0, secondary_tag_count: 0, deleted_at: null,
    ...over,
  }
}

beforeEach(() => {
  captured = []
  nextRows = []
})

describe('commission threads through the trades read path', () => {
  it('listTrades SELECT includes t.commission', () => {
    nextRows = [fakeRow()]
    listTrades()
    expect(captured.some((s) => /\bt\.commission\b/.test(s))).toBe(true)
  })

  it('getTrade SELECT includes t.commission', () => {
    nextRows = [fakeRow()]
    getTrade(1)
    expect(captured.some((s) => /\bt\.commission\b/.test(s))).toBe(true)
  })

  it('listTrades maps a stored commission onto the row (Ocean One: a number)', () => {
    nextRows = [fakeRow({ commission: 0.1 })]
    const out = listTrades()
    expect(out[0].commission).toBe(0.1)
  })

  it('getTrade maps NULL commission to null, not undefined-by-omission (DAS/Webull)', () => {
    nextRows = [fakeRow({ commission: null })]
    const out = getTrade(1)
    expect(out).not.toBeNull()
    expect(out!.commission).toBeNull()
  })
})

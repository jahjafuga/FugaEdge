// v0.2.7 — SECTOR, INDUSTRY, MARKET CAP REACH THE ROW.
//
// MEASURED (the filter-arc inventory): market_data carries sector, industry
// and market_cap for every real-book symbol — fetched by the SAME FMP profile
// call that supplies country, stored since schema 22, and never SELECTed by
// the trades read. The renderer could not see them at all.
//
// The threading follows the tf_1m_ema9_dist_pct precedent one join over:
// LEFT JOIN market_data (alias mkt — `md` is taken by mistake_def in the
// mistake-tags subquery), three fields onto the row, nulls preserved. LEFT,
// not INNER: a symbol with no market_data row keeps its trade visible and
// carries nulls — never a dropped row, never a fabricated value.
//
// MARKET CAP'S SEMANTIC, stated: market_data is per-symbol-LATEST (symbol is
// the PRIMARY KEY, one fetched_at per row) — the cap is the snapshot at the
// last refresh, not the cap on the day of the trade. Same contract as
// float_shares, which the row already documents as a CURRENT snapshot.
//
// SQL-contract + mapper test — better-sqlite3's native binary won't load under
// vitest, so openDatabase is a capturing shim (the list-ema9-join idiom).
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

function fakeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, date: '2026-05-01', symbol: 'RDGT', side: 'long',
    open_time: '2026-05-01T13:30:00Z', close_time: '2026-05-01T13:35:00Z', is_open: 0,
    shares_bought: 1, avg_buy_price: 2.89, shares_sold: 1, avg_sell_price: 2.92,
    gross_pnl: 0.03, total_fees: 0.15, commission: 0.1, net_pnl: -0.12,
    executions_json: '[]',
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    tf_1m_ema9_dist_pct: null,
    mae: null, mfe: null, daily_change_pct: null, rvol: null,
    playbook_id: null, playbook_name: null, playbook_tier: null,
    confidence: null, planned_risk: null, planned_stop_loss_price: null,
    float_shares: null, shares_outstanding: null,
    catalyst_type: null, days_since_catalyst: null,
    country: null, country_name: null, region: null, country_source: null,
    sector: 'Healthcare', industry: 'Biotechnology', market_cap: 48_000_000,
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

describe('J1 sector / industry / market cap thread through the trades read path', () => {
  it('listTrades LEFT JOINs market_data and SELECTs the three fields', () => {
    nextRows = [fakeRow()]
    listTrades()
    const sql = captured.find((s) => /market_data/i.test(s))
    expect(sql, 'the list SELECT never touches market_data').toBeTruthy()
    expect(sql!).toMatch(/LEFT JOIN\s+market_data/i)
    expect(sql!).toMatch(/\bsector\b/i)
    expect(sql!).toMatch(/\bindustry\b/i)
    expect(sql!).toMatch(/\bmarket_cap\b/i)
  })

  it('getTrade does the same', () => {
    nextRows = [fakeRow()]
    getTrade(1)
    const sql = captured.find((s) => /market_data/i.test(s) && /WHERE/i.test(s))
    expect(sql, 'the single-trade SELECT never touches market_data').toBeTruthy()
    expect(sql!).toMatch(/LEFT JOIN\s+market_data/i)
  })

  it('a symbol WITH market_data resolves all three on the row', () => {
    nextRows = [fakeRow()]
    const out = listTrades()
    expect(out[0].sector).toBe('Healthcare')
    expect(out[0].industry).toBe('Biotechnology')
    expect(out[0].market_cap).toBe(48_000_000)
  })

  it('a symbol WITHOUT market_data resolves nulls — never a crash, never a fake', () => {
    // What the LEFT JOIN hands the mapper on a miss.
    nextRows = [fakeRow({ sector: null, industry: null, market_cap: null })]
    const out = listTrades()
    expect(out).toHaveLength(1)
    expect(out[0].sector).toBeNull()
    expect(out[0].industry).toBeNull()
    expect(out[0].market_cap).toBeNull()
  })

  it('getTrade maps them too, nulls preserved', () => {
    nextRows = [fakeRow({ sector: null, industry: null, market_cap: null })]
    const out = getTrade(1)
    expect(out).not.toBeNull()
    expect(out!.sector).toBeNull()
    expect(out!.market_cap).toBeNull()
  })
})

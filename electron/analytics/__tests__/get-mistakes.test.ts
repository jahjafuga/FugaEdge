// Beat 2c-display-α — server-path mistakes source cut. getAnalytics' computeMistakes
// now reads the trade_mistake junction NAMES (a json_group_array(md.name ORDER BY
// md.axis, md.sort_position) join, aliased mistake_names_json) instead of
// trades.mistakes_json. This SQL-contract + output test pins:
//   (i)  the batched mistake_names_json join is issued (and t.mistakes_json is gone),
//   (ii) computeMistakes' byMistake / with-without aggregate OUTPUT shape is
//        UNCHANGED when fed junction names instead of parseMistakesJson.
// Mock-shim idiom: better-sqlite3's native binary won't load under vitest, so
// openDatabase is mocked with a capturing shim (same idiom as the list-commission
// and mistakes-repo tests). The json_group_array ordering itself is SQL — the mock
// supplies the pre-aggregated JSON string; we assert the cut, not SQLite.

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

import { getAnalytics } from '../get'

// Minimal analytics TradeRow — only the fields the compute fns read.
// mistake_names_json carries the junction names (a JSON string array, exactly the
// json_group_array(md.name) output shape).
function tradeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, date: '2026-05-01', symbol: 'AAA', side: 'long',
    open_time: '2026-05-01T13:30:00Z',
    shares_bought: 1, shares_sold: 1, avg_buy_price: 1, avg_sell_price: 1,
    gross_pnl: 0, total_fees: 0, net_pnl: 0, executions_json: '[]',
    entry_timeframe: null, entry_ema9_distance_pct: null, confidence: null,
    mistake_names_json: '[]',
    planned_risk: null, planned_stop_loss_price: null, float_shares: null,
    catalyst_type: null, sentiment: null,
    ...over,
  }
}

beforeEach(() => {
  captured = []
  nextRows = []
})

describe('getAnalytics — server mistakes source cut (2c-display-α)', () => {
  it('(i) issues the batched mistake_names_json join from trade_mistake → mistake_def', () => {
    nextRows = [] // zero trades — we only assert the SQL shape here
    getAnalytics()
    const sql = captured.find(
      (s) => /json_group_array/i.test(s) && /AS mistake_names_json/i.test(s),
    )
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/json_group_array\(\s*md\.name/i)
    expect(sql!).toMatch(/ORDER BY md\.axis, md\.sort_position/i)
    expect(sql!).toMatch(/FROM trade_mistake/i)
    expect(sql!).toMatch(/JOIN mistake_def md/i)
  })

  it('(i) the main analytics SELECT no longer reads t.mistakes_json', () => {
    nextRows = []
    getAnalytics()
    const mainSelect = captured.find(
      (s) => /FROM trades t/i.test(s) && /session_meta/i.test(s),
    )
    expect(mainSelect).toBeTruthy()
    expect(mainSelect!).not.toMatch(/t\.mistakes_json/i)
  })

  it('(ii) computeMistakes aggregates by junction NAME — byMistake + with/without shape unchanged', () => {
    nextRows = [
      tradeRow({ id: 1, net_pnl: 100, mistake_names_json: JSON.stringify(['Chased extension (too far from 9 EMA)']) }),
      tradeRow({ id: 2, net_pnl: -50, mistake_names_json: JSON.stringify(['Chased extension (too far from 9 EMA)', 'FOMO - chased a runner']) }),
      tradeRow({ id: 3, net_pnl: 30, mistake_names_json: '[]' }),
    ]
    const { mistakes } = getAnalytics()

    // with / without aggregates (rows 1 & 2 are flawed; row 3 is clean)
    expect(mistakes.trades_with_any_mistake).toBe(2)
    expect(mistakes.trades_without_mistakes).toBe(1)
    expect(mistakes.flawed_net_pnl).toBe(50) // 100 + -50
    expect(mistakes.clean_net_pnl).toBe(30)

    // byMistake keyed by junction NAME, worst (lowest net) first
    expect(mistakes.byMistake.map((m) => m.label)).toEqual([
      'FOMO - chased a runner', // net -50
      'Chased extension (too far from 9 EMA)', // net 50
    ])
    const chase = mistakes.byMistake.find(
      (m) => m.label === 'Chased extension (too far from 9 EMA)',
    )!
    expect(chase.trade_count).toBe(2)
    expect(chase.net_pnl).toBe(50)
    const fomo = mistakes.byMistake.find((m) => m.label === 'FOMO - chased a runner')!
    expect(fomo.trade_count).toBe(1)
    expect(fomo.net_pnl).toBe(-50)
  })
})

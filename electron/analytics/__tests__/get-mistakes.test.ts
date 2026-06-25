// Beat 2c-display-β.1 — server mistakes analytics now carries AXIS. getAnalytics'
// computeMistakes reads the trade_mistake junction as {name, axis} objects (a
// json_group_array(json_object('name', md.name, 'axis', md.axis)) join, aliased
// mistake_tags_json — the SAME shape list.ts already ships), keys its per-mistake
// map by (axis, name), and stamps each byMistake row with its axis. This SQL-
// contract + output test pins:
//   (i)   the batched mistake_tags_json json_object(name+axis) join is issued
//         (and t.mistakes_json is gone),
//   (ii)  computeMistakes' byMistake + with/without AGGREGATE values are byte-
//         identical to α (only keying + the added axis field change), and each
//         byMistake row carries the right axis,
//   (iii) same-name-different-axis stays TWO distinct rows (the (axis,name) key).
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
// mistake_tags_json carries the junction tags (a JSON string array of {name, axis}
// objects, exactly the json_group_array(json_object(...)) output shape).
function tradeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, date: '2026-05-01', symbol: 'AAA', side: 'long',
    open_time: '2026-05-01T13:30:00Z',
    shares_bought: 1, shares_sold: 1, avg_buy_price: 1, avg_sell_price: 1,
    gross_pnl: 0, total_fees: 0, net_pnl: 0, executions_json: '[]',
    entry_timeframe: null, entry_ema9_distance_pct: null, confidence: null,
    mistake_tags_json: '[]',
    planned_risk: null, planned_stop_loss_price: null, float_shares: null,
    catalyst_type: null, sentiment: null,
    ...over,
  }
}

// {name, axis}[] → the json_object array string the SQL join produces.
function tagsJson(
  ...tags: { name: string; axis: 'technical' | 'psychological' }[]
): string {
  return JSON.stringify(tags)
}

beforeEach(() => {
  captured = []
  nextRows = []
})

describe('getAnalytics — server mistakes axis wiring (2c-display-β.1)', () => {
  it('(i) issues the batched mistake_tags_json json_object(name+axis) join from trade_mistake → mistake_def', () => {
    nextRows = [] // zero trades — we only assert the SQL shape here
    getAnalytics()
    const sql = captured.find(
      (s) => /json_group_array/i.test(s) && /AS mistake_tags_json/i.test(s),
    )
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/json_group_array\(\s*json_object\(/i)
    expect(sql!).toMatch(/json_object\(\s*'name',\s*md\.name,\s*'axis',\s*md\.axis\s*\)/i)
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

  it('(ii) aggregates by (axis,name) — AGGREGATE values byte-identical to α, each row carries axis', () => {
    nextRows = [
      tradeRow({ id: 1, net_pnl: 100, mistake_tags_json: tagsJson({ name: 'Chased extension (too far from 9 EMA)', axis: 'technical' }) }),
      tradeRow({ id: 2, net_pnl: -50, mistake_tags_json: tagsJson({ name: 'Chased extension (too far from 9 EMA)', axis: 'technical' }, { name: 'FOMO - chased a runner', axis: 'psychological' }) }),
      tradeRow({ id: 3, net_pnl: 30, mistake_tags_json: '[]' }),
    ]
    const { mistakes } = getAnalytics()

    // with / without aggregates (rows 1 & 2 flawed; row 3 clean) — UNCHANGED from α
    expect(mistakes.trades_with_any_mistake).toBe(2)
    expect(mistakes.trades_without_mistakes).toBe(1)
    expect(mistakes.flawed_net_pnl).toBe(50) // 100 + -50
    expect(mistakes.clean_net_pnl).toBe(30)

    // byMistake keyed by name, worst (lowest net) first — UNCHANGED from α
    expect(mistakes.byMistake.map((m) => m.label)).toEqual([
      'FOMO - chased a runner', // net -50
      'Chased extension (too far from 9 EMA)', // net 50
    ])
    const chase = mistakes.byMistake.find(
      (m) => m.label === 'Chased extension (too far from 9 EMA)',
    )!
    expect(chase.trade_count).toBe(2)
    expect(chase.net_pnl).toBe(50)
    expect(chase.axis).toBe('technical') // β.1 — row now carries axis
    const fomo = mistakes.byMistake.find((m) => m.label === 'FOMO - chased a runner')!
    expect(fomo.trade_count).toBe(1)
    expect(fomo.net_pnl).toBe(-50)
    expect(fomo.axis).toBe('psychological') // β.1 — row now carries axis
  })

  it('(iii) same name on two axes stays TWO distinct rows (the (axis,name) key)', () => {
    nextRows = [
      tradeRow({ id: 1, net_pnl: 10, mistake_tags_json: tagsJson({ name: 'X', axis: 'technical' }) }),
      tradeRow({ id: 2, net_pnl: -20, mistake_tags_json: tagsJson({ name: 'X', axis: 'psychological' }) }),
    ]
    const { mistakes } = getAnalytics()

    const xs = mistakes.byMistake.filter((m) => m.label === 'X')
    expect(xs).toHaveLength(2) // NOT merged into one row
    const tech = xs.find((m) => m.axis === 'technical')!
    const psych = xs.find((m) => m.axis === 'psychological')!
    expect(tech.trade_count).toBe(1)
    expect(tech.net_pnl).toBe(10)
    expect(psych.trade_count).toBe(1)
    expect(psych.net_pnl).toBe(-20)
  })
})

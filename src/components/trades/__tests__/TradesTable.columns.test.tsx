// @vitest-environment jsdom
// v0.2.7 Feature 4, Commit 2 — the fifteen optional columns.
//
// Every value is either DELIVERED on TradeListRow or computed by a core module. The
// component adds no arithmetic, which T12 guards at the source level.
//
// The coverage measured on the real books is why T9 matters more than T8 here: MAE is
// 4/28 live and 0/528 historical, R is 17/28 and 0/528. For most rows these columns
// ARE the empty state, so an em dash that never becomes a zero or a NaN is the
// feature, not an edge case.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
// jsdom gives the scroll container a clientHeight of 0, so the real virtualizer
// renders no rows. Shared passthrough, same as the sorting suite.
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const NEW_COLS = [
  'hold_time', 'price_move_pct', 'pnl_gain_pct', 'exec_count', 'first_entry',
  'stop_price', 'r_multiple', 'risk_per_share', 'total_risk', 'rvol',
  'daily_change_pct', 'confidence', 'entry_timeframe', 'days_since_catalyst',
  'mae', 'mfe',
]
// Headers ARE the registry labels as of the labels commit — one source, so this map
// tracks them rather than restating a second vocabulary.
const HEADERS: Record<string, string> = {
  hold_time: 'Hold time', price_move_pct: 'Price move %', pnl_gain_pct: 'Gain %',
  exec_count: 'Fills', first_entry: 'First entry', stop_price: 'Stop price',
  r_multiple: 'R multiple', risk_per_share: 'Risk / share', total_risk: 'Total risk',
  rvol: 'RVOL', daily_change_pct: 'Day change %', confidence: 'Confidence',
  entry_timeframe: 'Timeframe', days_since_catalyst: 'Days since catalyst',
  mae: 'MAE', mfe: 'MFE',
}

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}

const FULL: TradeListRow = makeTrade({
  id: 1, symbol: 'VEEE', side: 'long',
  open_time: '2026-07-13T13:30:00Z', close_time: '2026-07-13T14:00:00Z',
  shares_bought: 100, shares_sold: 100, avg_buy_price: 10, avg_sell_price: 11,
  gross_pnl: 100, total_fees: 5, net_pnl: 95,
  planned_stop_loss_price: 9.5, r_multiple: 1.9, risk_per_share: 0.5, total_risk: 50,
  rvol: 5.25, daily_change_pct: 12.5, confidence: 4, entry_timeframe: '1m',
  days_since_catalyst: 3, mae: -20, mfe: 140,
  executions: [
    { side: 'B', price: 9.9, shares: 50, time: '2026-07-13T13:30:00Z' },
    { side: 'B', price: 10.1, shares: 50, time: '2026-07-13T13:31:00Z' },
    { side: 'S', price: 11, shares: 100, time: '2026-07-13T14:00:00Z' },
  ] as never,
})
const EMPTY_ROW: TradeListRow = makeTrade({
  id: 2, symbol: 'AAAA', close_time: null,
  planned_stop_loss_price: null, r_multiple: null, risk_per_share: null,
  total_risk: null, rvol: null, daily_change_pct: null, confidence: null,
  entry_timeframe: null, days_since_catalyst: null, mae: null, mfe: null,
  avg_buy_price: 0, avg_sell_price: 0, shares_bought: 0, shares_sold: 0,
  executions: [] as never,
})

const showAll = () => {
  const v: Record<string, boolean> = {}
  for (const id of NEW_COLS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const headers = () =>
  Array.from(document.querySelectorAll('thead th')).map((e) => e.textContent?.trim() ?? '')
const rowsEl = () => Array.from(document.querySelectorAll('tbody tr'))
const rowCells = (i: number) => {
  const r = rowsEl()[i]
  if (!r) return []
  return Array.from(r.querySelectorAll('td')).map((e) => e.textContent?.trim() ?? '')
}
const cellFor = (rowIdx: number, col: string) => rowCells(rowIdx)[headers().indexOf(HEADERS[col])]

beforeEach(() => localStorage.clear())
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the fifteen optional columns', () => {
  it('T8 each renders its value for a fully-populated row', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[FULL]} />)
    expect(cellFor(0, 'hold_time')).toBe('30m')
    expect(cellFor(0, 'exec_count')).toBe('3')
    expect(cellFor(0, 'first_entry')).toContain('9.9')
    expect(cellFor(0, 'stop_price')).toContain('9.5')
    expect(cellFor(0, 'r_multiple')).toBe('1.90R')
    expect(cellFor(0, 'rvol')).toBe('5.25x')
    expect(cellFor(0, 'confidence')).toBe('4')
    expect(cellFor(0, 'entry_timeframe')).toBe('1m')
    expect(cellFor(0, 'days_since_catalyst')).toBe('3')
    expect(cellFor(0, 'price_move_pct')).toContain('10.00%')
    expect(cellFor(0, 'pnl_gain_pct')).toContain('9.50%')
  })

  it('T9 every column is an em dash when its source is null — never NaN, 0 or Infinity', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[EMPTY_ROW]} />)
    // exec_count is EXCLUDED deliberately: a fill count of zero is a real, measured
    // count, not an absent measurement. Every other column here reports something
    // that was never observed, where a 0 would be a claim nobody made.
    for (const c of NEW_COLS.filter((c) => c !== 'exec_count')) {
      const v = cellFor(0, c)
      expect(v, `${c} should em-dash`).toBe('—')
      expect(v).not.toMatch(/NaN|Infinity/)
    }
    expect(cellFor(0, 'exec_count')).toBe('0')
    // Named explicitly because their real-book coverage is 14% and 61%.
    expect(cellFor(0, 'mae')).toBe('—')
    expect(cellFor(0, 'r_multiple')).toBe('—')
  })

  it('T10 nulls sort LAST ascending AND descending', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[EMPTY_ROW, FULL]} />)
    const rHeader = screen.getAllByText('R multiple')[0]

    rHeader.click()
    let symbols = [0, 1].map((i) => rowCells(i)[headers().indexOf('Symbol')])
    expect(symbols[symbols.length - 1]).toBe('AAAA') // null last ascending

    rHeader.click()
    symbols = [0, 1].map((i) => rowCells(i)[headers().indexOf('Symbol')])
    expect(symbols[symbols.length - 1]).toBe('AAAA') // and still last descending
  })

  it('T11 STAND-DOWN: the columns visible today are unchanged', () => {
    render(<TradesTable {...PROPS} trades={[FULL]} />) // no prefs -> defaults
    const h = headers()
    expect(h).toContain('Symbol')
    expect(h).toContain('Net P&L')
    expect(h).not.toContain('MAE') // new columns default hidden
    expect(h).not.toContain('RVOL')
    expect(cellFor(0, 'r_multiple' in HEADERS ? 'exec_count' : 'exec_count')).toBeUndefined()
  })

  it('T12 no arithmetic was added to the component', () => {
    const t = src('src/components/trades/TradesTable.tsx')
    // the derivations live in core and are imported, not inlined
    expect(t).toMatch(/holdTimeSeconds|pnlGainPct/)
    expect(t).not.toMatch(/Date\.parse\(/)
    expect(t).not.toMatch(/close_time\)\s*-\s*/)
  })
})

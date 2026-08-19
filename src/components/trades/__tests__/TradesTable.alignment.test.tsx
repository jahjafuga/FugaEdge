// @vitest-environment jsdom
// v0.2.7 — HEADERS AND CELLS MUST LINE UP.
//
// Reported from the running build on one row (INLF, Aug 5, 09:42:42):
//   catalyst OFF, mistakes OFF -> aligned
//   catalyst OFF, mistakes ON  -> data one column LEFT of its header
//   catalyst ON,  mistakes ON  -> two columns LEFT
//
// The shift scaling with the number of enabled columns is the tell. The table is
// `tableLayout: fixed`, so a row that emits FEWER <td> than the header has <th>
// does not leave a hole where the missing cell belongs — the browser packs the
// cells it was given from the left, and every column after the gap slides one slot
// out from under its heading.
//
// T1 is deliberately driven from the registry rather than a hand-written list, so
// a column added later cannot escape it the way these two did.

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_LABELS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}

/** The reported row: a real trade carrying neither a catalyst nor a mistake. */
const BARE: TradeListRow = makeTrade({
  id: 1, symbol: 'INLF', date: '2026-08-05', side: 'long',
  open_time: '2026-08-05T13:42:42Z', close_time: '2026-08-05T14:10:00Z',
  shares_bought: 100, shares_sold: 100, avg_buy_price: 10, avg_sell_price: 11,
  gross_pnl: 100, total_fees: 5, net_pnl: 95,
  catalyst_type: null,
  mistakes: [] as never,
  float_shares: null,
  country: null, country_name: null as never, region: null as never,
})

/** Everything a nullable column could be empty for, empty at once. */
const ALL_EMPTY: TradeListRow = makeTrade({
  id: 2, symbol: 'ZZZZ', date: '2026-08-05', close_time: null,
  catalyst_type: null, mistakes: [] as never, float_shares: null,
  country: null, country_name: null as never, region: null as never,
  playbook_name: null, playbook_id: null, playbook_tier: null,
  planned_stop_loss_price: null, r_multiple: null, risk_per_share: null,
  total_risk: null, rvol: null, daily_change_pct: null, confidence: null,
  entry_timeframe: null, days_since_catalyst: null, mae: null, mfe: null,
  stop_source: null, note: null,
  avg_buy_price: 0, avg_sell_price: 0, shares_bought: 0, shares_sold: 0,
  executions: [] as never,
})

/** A row with something in every column. */
const FULL: TradeListRow = makeTrade({
  id: 3, symbol: 'VEEE', date: '2026-08-05', side: 'short',
  open_time: '2026-08-05T13:30:00Z', close_time: '2026-08-05T14:00:00Z',
  shares_bought: 100, shares_sold: 100, avg_buy_price: 10, avg_sell_price: 11,
  gross_pnl: 100, total_fees: 5, net_pnl: 95,
  catalyst_type: 'Earnings', mistakes: ['FOMO', 'Chased'] as never,
  float_shares: 5_000_000, country: 'US', country_name: 'United States',
  region: 'USA', playbook_name: 'Gap and go', planned_stop_loss_price: 9.5,
  r_multiple: 1.9, risk_per_share: 0.5, total_risk: 50, rvol: 5.25,
  daily_change_pct: 12.5, confidence: 4, entry_timeframe: '1m',
  days_since_catalyst: 3, mae: -20, mfe: 140, stop_source: 'manual',
  executions: [
    { side: 'B', price: 9.9, shares: 50, time: '2026-08-05T13:30:00Z' },
    { side: 'S', price: 11, shares: 100, time: '2026-08-05T14:00:00Z' },
  ] as never,
})

const showAll = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const show = (ids: string[]) => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = ids.includes(id)
  v.symbol = true // unhideable
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}

const headers = () =>
  Array.from(document.querySelectorAll('thead th')).map((e) => e.textContent?.trim() ?? '')
const cellsOf = (rowIdx: number) => {
  const r = Array.from(document.querySelectorAll('tbody tr'))[rowIdx]
  return r ? Array.from(r.querySelectorAll('td')).map((e) => e.textContent?.trim() ?? '') : []
}

beforeEach(() => localStorage.clear())

describe('T1 every column emits a CELL for a row whose value is empty', () => {
  it('cell count equals header count with every column visible', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[ALL_EMPTY]} />)
    const h = headers()
    const c = cellsOf(0)
    expect(h.length).toBeGreaterThan(20) // the whole registry is on
    expect(
      c.length,
      `${h.length - c.length} column(s) render a header but no cell, so every ` +
        `column after the gap slides out from under its heading.\n` +
        `headers: ${JSON.stringify(h)}\ncells:   ${JSON.stringify(c)}`,
    ).toBe(h.length)
  })

  it('and one column at a time — the registry drives it, so nothing new escapes', () => {
    for (const id of ALL_COLUMN_IDS) {
      localStorage.clear()
      show([id])
      const { unmount } = render(<TradesTable {...PROPS} trades={[ALL_EMPTY]} />)
      const h = headers().length
      const c = cellsOf(0).length
      unmount()
      document.body.replaceChildren()
      expect(c, `column '${id}' (${COLUMN_LABELS[id] ?? id}) emits no cell when empty`)
        .toBe(h)
    }
  })
})

describe('T2 the reported reproduction', () => {
  it('catalyst and mistakes visible, a trade with neither, cells align', () => {
    show(['open_time', 'symbol', 'side', 'catalyst', 'mistakes', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={[BARE]} />)
    const h = headers()
    const c = cellsOf(0)
    expect(c.length, `headers ${h.length} vs cells ${c.length}`).toBe(h.length)
  })

  it('turning them off and on does not move the other columns', () => {
    show(['open_time', 'symbol', 'side', 'net_pnl'])
    const { unmount } = render(<TradesTable {...PROPS} trades={[BARE]} />)
    const sideIdxOff = headers().indexOf('Side')
    const sideValOff = cellsOf(0)[sideIdxOff]
    unmount()
    document.body.replaceChildren()
    localStorage.clear()

    show(['open_time', 'symbol', 'side', 'catalyst', 'mistakes', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={[BARE]} />)
    const sideIdxOn = headers().indexOf('Side')
    expect(cellsOf(0)[sideIdxOn]).toBe(sideValOff)
  })
})

describe('T3 SIDE renders under the SIDE header, by index', () => {
  it('long, with catalyst and mistakes on and empty', () => {
    show(['open_time', 'symbol', 'side', 'catalyst', 'mistakes', 'net_pnl'])
    render(<TradesTable {...PROPS} trades={[BARE]} />)
    const i = headers().indexOf('Side')
    expect(i).toBeGreaterThan(-1)
    expect(cellsOf(0)[i]?.toUpperCase()).toContain('LONG')
  })

  it('T4 the same on a row where EVERY nullable column is empty', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[ALL_EMPTY]} />)
    const h = headers()
    const c = cellsOf(0)
    const i = h.indexOf('Side')
    expect(i).toBeGreaterThan(-1)
    expect(c[i]?.toUpperCase()).toContain('LONG')
    // Symbol too — the one column that can never be hidden.
    expect(c[h.indexOf('Symbol')]).toContain('ZZZZ')
  })
})

describe('T5 STAND-DOWN: a fully populated row still renders correctly', () => {
  it('aligns, and its values sit under their own headers', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[FULL]} />)
    const h = headers()
    const c = cellsOf(0)
    expect(c.length).toBe(h.length)
    expect(c[h.indexOf('Symbol')]).toContain('VEEE')
    expect(c[h.indexOf('Side')]?.toUpperCase()).toContain('SHORT')
    expect(c[h.indexOf('Catalyst')]).toBe('Earnings')
    expect(c[h.indexOf('Mistakes')]).toContain('FOMO')
    expect(c[h.indexOf('R multiple')]).toBe('1.90R')
  })

  it('a mixed book keeps every row the same width as the header', () => {
    showAll()
    render(<TradesTable {...PROPS} trades={[FULL, ALL_EMPTY, BARE]} />)
    const h = headers().length
    for (let i = 0; i < 3; i++) {
      expect(cellsOf(i).length, `row ${i} is short`).toBe(h)
    }
  })
})

// v0.2.7 Feature 1, Commit 1 — ONE equity implementation, two callers.
//
// buildEquityCurve has lived in this module since the Compare feature needed an
// equity curve in the renderer. electron/analytics/get.ts nonetheless carried its
// OWN computeEquity — the same algorithm, differing only in the output field name
// (cumulative vs cumulative_net_pnl). Two copies of the number the whole Analytics
// page is built on is a drift waiting to happen, and the global-filter work is about
// to add a third caller.
//
// These pin that there is exactly one, and that it stays portable.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEquityCurve } from '../equity'

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('equity — a single shared implementation', () => {
  it('T1 the shared module imports nothing from electron / fs / sqlite', () => {
    const text = src('src/core/performance/equity.ts')
    const imports = text.match(/^import .*$/gm) ?? []
    for (const line of imports) {
      expect(line).not.toMatch(/electron|better-sqlite3|node:fs|['"]fs['"]/)
    }
  })

  it('T2 accepts a TradeRow-shaped and a TradeListRow-shaped array identically', () => {
    // The minimal shape is { date, net_pnl }; both real row types are supersets.
    const asTradeRow = [
      { date: '2026-07-13', net_pnl: 10, symbol: 'VEEE', gross_pnl: 12 },
      { date: '2026-07-13', net_pnl: -4, symbol: 'VEEE', gross_pnl: -3 },
      { date: '2026-07-14', net_pnl: 7, symbol: 'AAPL', gross_pnl: 8 },
    ]
    const asTradeListRow = [
      { date: '2026-07-13', net_pnl: 10, playbook_name: 'Bull Flag', is_open: false },
      { date: '2026-07-13', net_pnl: -4, playbook_name: null, is_open: false },
      { date: '2026-07-14', net_pnl: 7, playbook_name: 'Bull Flag', is_open: false },
    ]
    expect(buildEquityCurve(asTradeRow)).toEqual(buildEquityCurve(asTradeListRow))
    expect(buildEquityCurve(asTradeRow)).toEqual([
      { date: '2026-07-13', daily_pnl: 6, cumulative: 6 },
      { date: '2026-07-14', daily_pnl: 7, cumulative: 13 },
    ])
  })

  it('T17 the analytics payload ships NO equity series and NO drawdown', () => {
    const types = src('shared/analytics-types.ts')
    // Removed in v0.2.7 — the Overview computes both from the filtered trade list,
    // so an unfiltered copy in the payload could only disagree with the screen.
    expect(types).not.toMatch(/^\s*equity:\s*EquityPoint\[\]/m)
    expect(types).not.toMatch(/^\s*maxDrawdown:/m)

    const get = src('electron/analytics/get.ts')
    expect(get).not.toMatch(/^\s*equity,$/m)
    expect(get).not.toMatch(/^\s*maxDrawdown,$/m)
    // NOTE: get.ts still CALLS the shared buildEquityCurve — the rule-break rollup
    // pairs against the per-date net P&L it produces. That is a legitimate internal
    // consumer, not a second implementation, which is what T3 below guards.
  })

  it('T3 electron/analytics/get.ts defines NO equity builder of its own', () => {
    const text = src('electron/analytics/get.ts')
    // The duplicate this commit removes.
    expect(text).not.toMatch(/function\s+computeEquity\s*\(/)
    // ...and it reaches for the shared one instead.
    expect(text).toMatch(/buildEquityCurve/)
  })
})

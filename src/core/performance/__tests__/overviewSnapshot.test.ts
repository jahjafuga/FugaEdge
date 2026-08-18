// v0.2.7 Feature 1, Commit 2 — the Analytics Overview computes from ONE filtered set.
//
// The page ran two sources side by side: an UNFILTERED IPC snapshot driving the
// equity curve, drawdown, best/worst day and the tiles, and a separately-filtered
// trade list driving only the daily breakdown below. So the chart and the tiles could
// describe different books, and a filter the user set moved half the page.
//
// Everything now derives from one filtered list. These pin the invariants that makes
// true — above all T6: the curve's last cumulative point IS the Net P&L tile.

import { describe, expect, it } from 'vitest'
import { computeOverviewSnapshot } from '../overviewSnapshot'
import { emptyFilters } from '../filters'
import type { OverviewFilters } from '../types'
import type { TradeListRow } from '@shared/trades-types'

let id = 1
function mk(over: Partial<TradeListRow>): TradeListRow {
  return {
    account_id: 'A', id: id++, date: '2026-07-13', symbol: 'VEEE', side: 'long',
    open_time: '2026-07-13T13:30:00Z', close_time: '2026-07-13T14:00:00Z',
    is_open: false, shares_bought: 100, avg_buy_price: 5, shares_sold: 100,
    avg_sell_price: 5, gross_pnl: 0, total_fees: 0, net_pnl: 0, executions: [],
    note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    mae: null, mfe: null, playbook_id: null, playbook_name: null, playbook_tier: null,
    confidence: null, mistakes: [], planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null, daily_change_pct: null,
    rvol: null, float_shares: null, shares_outstanding: null, catalyst_type: null,
    days_since_catalyst: null, country: null, country_name: 'Unknown',
    region: 'Unknown', country_source: 'unknown', attachment_count: 0,
    secondary_tag_count: 0, deleted_at: null,
    ...over,
  }
}

const BOOK: TradeListRow[] = [
  mk({ date: '2026-07-13', symbol: 'VEEE', net_pnl: 100, gross_pnl: 110, total_fees: 10 }),
  mk({ date: '2026-07-13', symbol: 'VEEE', net_pnl: -40, gross_pnl: -35, total_fees: 5 }),
  mk({ date: '2026-07-14', symbol: 'AAPL', net_pnl: 60, gross_pnl: 66, total_fees: 6, playbook_name: 'Bull Flag' }),
  mk({ date: '2026-07-15', symbol: 'VEEE', net_pnl: -70, gross_pnl: -64, total_fees: 6 }),
  mk({ date: '2026-07-16', symbol: 'AAPL', net_pnl: 30, gross_pnl: 34, total_fees: 4, playbook_name: 'Bull Flag' }),
]

const f = (over: Partial<OverviewFilters> = {}): OverviewFilters => ({ ...emptyFilters(), ...over })
const last = <T,>(a: T[]): T | undefined => a[a.length - 1]

describe('computeOverviewSnapshot — one filtered set drives every widget', () => {
  it('T4 changing the range moves the equity curve point count', () => {
    const all = computeOverviewSnapshot(BOOK, f())
    const narrowed = computeOverviewSnapshot(
      BOOK,
      f({ range: { from: '2026-07-14', to: '2026-07-15' } }),
    )
    expect(all.curve.length).toBe(4) // four distinct dates
    expect(narrowed.curve.length).toBe(2)
    expect(narrowed.curve.length).not.toBe(all.curve.length)
  })

  it('T5 changing the symbol filter moves the tile values', () => {
    const all = computeOverviewSnapshot(BOOK, f())
    const veee = computeOverviewSnapshot(BOOK, f({ symbol: 'VEEE' }))
    expect(all.metrics.netPnL).toBe(80)
    expect(veee.metrics.netPnL).toBe(-10)
    expect(veee.metrics.trades).toBe(3)
  })

  it('T6 THE AGREEMENT INVARIANT: the curve final cumulative EQUALS the Net P&L tile', () => {
    const states: OverviewFilters[] = [
      f(),
      f({ symbol: 'VEEE' }),
      f({ symbol: 'AAPL' }),
      f({ side: 'long' }),
      f({ playbooks: ['Bull Flag'] }),
      f({ range: { from: '2026-07-14', to: '2026-07-16' } }),
      f({ symbol: 'VEEE', range: { from: '2026-07-13', to: '2026-07-13' } }),
    ]
    for (const state of states) {
      const s = computeOverviewSnapshot(BOOK, state)
      const finalCum = last(s.curve)?.cumulative ?? 0
      expect(Number(finalCum.toFixed(2))).toBe(Number(s.metrics.netPnL.toFixed(2)))
    }
  })

  it('T7 playbook filtering reaches the top widgets (the IPC payload could not do this)', () => {
    const s = computeOverviewSnapshot(BOOK, f({ playbooks: ['Bull Flag'] }))
    expect(s.metrics.trades).toBe(2)
    expect(s.metrics.netPnL).toBe(90)
    expect(last(s.curve)?.cumulative).toBe(90)
  })

  it('T9 STAND-DOWN: cleared filters reproduce the whole-book numbers', () => {
    const s = computeOverviewSnapshot(BOOK, f())
    expect(s.metrics.netPnL).toBe(80)
    expect(s.metrics.trades).toBe(5)
    expect(s.metrics.grossPnL).toBe(111)
    expect(s.metrics.fees).toBe(31)
  })

  it('T18 the drawdown peak and trough fall INSIDE the active range', () => {
    const range = { from: '2026-07-14', to: '2026-07-16' }
    const s = computeOverviewSnapshot(BOOK, f({ range }))
    expect(s.drawdown).not.toBeNull()
    expect(s.drawdown!.peak_date >= range.from).toBe(true)
    expect(s.drawdown!.peak_date <= range.to).toBe(true)
    expect(s.drawdown!.trough_date >= range.from).toBe(true)
    expect(s.drawdown!.trough_date <= range.to).toBe(true)
  })

  it('T19 an empty result is honest — no NaN, no Infinity, no blank where a zero belongs', () => {
    const s = computeOverviewSnapshot(BOOK, f({ symbol: 'NOSUCH' }))
    expect(s.curve).toEqual([])
    expect(s.drawdown).toBeNull()
    expect(s.metrics.bestDay).toBeNull()
    expect(s.metrics.worstDay).toBeNull()
    // Absolute counters are real zeros, not nulls or blanks.
    expect(s.metrics.netPnL).toBe(0)
    expect(s.metrics.grossPnL).toBe(0)
    expect(s.metrics.fees).toBe(0)
    expect(s.metrics.trades).toBe(0)
    // Ratios are NULL — never NaN, never Infinity.
    expect(s.metrics.winRate).toBeNull()
    expect(s.metrics.avgWinner).toBeNull()
    expect(s.metrics.avgLoser).toBeNull()
    expect(s.metrics.profitFactor).toBeNull()
  })

  it('T19b profit factor with winners but ZERO losers is null, not Infinity', () => {
    const winnersOnly = [mk({ net_pnl: 50, gross_pnl: 55, total_fees: 5 })]
    const s = computeOverviewSnapshot(winnersOnly, f())
    expect(Number.isFinite(s.metrics.netPnL)).toBe(true)
    expect(s.metrics.profitFactor).toBeNull()
  })
})

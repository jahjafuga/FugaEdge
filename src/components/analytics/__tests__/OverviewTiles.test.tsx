// v0.2.7 Feature 1, Commit 3 — twelve tiles, six guarded.
//
// PRESENTATION ONLY. Every figure and every denominator already exists on
// PeriodMetrics; this pins how they are shown, not how they are computed.
//
// THE GUARD. A ratio over a handful of trades is not a small truth, it is noise
// wearing a percentage sign. Six tiles are ratios and get a guard keyed to THEIR OWN
// denominator, not the trade count — a book of 200 trades with 3 losers still has a
// meaningless average loser. Three states that must stay distinct: NONE (the
// denominator is zero, so no value exists at all), THIN (below the floor: shown, but
// muted and never bare), OK. The denominator is visible in every state.
//
// The six ABSOLUTE tiles are never guarded. Filtering to two trades must still tell
// the honest truth about money.

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OverviewTiles from '../OverviewTiles'
import { computePeriodMetrics } from '@/core/performance/metrics'
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
const win = (n = 1, over: Partial<TradeListRow> = {}) =>
  Array.from({ length: n }, () => mk({ net_pnl: 100, gross_pnl: 110, total_fees: 10, ...over }))
const loss = (n = 1, over: Partial<TradeListRow> = {}) =>
  Array.from({ length: n }, () => mk({ net_pnl: -50, gross_pnl: -45, total_fees: 5, ...over }))
const scratch = (n = 1) =>
  Array.from({ length: n }, () => mk({ net_pnl: 0, gross_pnl: 4, total_fees: 4 }))

const RANGE = { from: '2026-07-13', to: '2026-07-13' }
const renderFor = (trades: TradeListRow[]) => {
  const metrics = computePeriodMetrics(trades, RANGE)
  render(<OverviewTiles metrics={metrics} />)
  return metrics
}

const tile = (id: string) => screen.getByTestId(`tile-${id}`)
const valueOf = (id: string) => within(tile(id)).getByTestId('tile-value').textContent!.trim()
const numOf = (id: string) => Number.parseFloat(valueOf(id).replace(/[^0-9.-]/g, ''))
const stateOf = (id: string) => tile(id).getAttribute('data-state')
const denOf = (id: string) => within(tile(id)).getByTestId('tile-den').textContent!.trim()

const ORDER = [
  'net', 'gross', 'fees', 'count', 'winrate', 'plratio',
  'avgwin', 'avgloss', 'largestwin', 'largestloss', 'expectancy', 'profitfactor',
]
const GUARDED = ['winrate', 'plratio', 'avgwin', 'avgloss', 'expectancy', 'profitfactor']
const ABSOLUTE = ['net', 'gross', 'fees', 'count', 'largestwin', 'largestloss']

describe('OverviewTiles — twelve tiles, six guarded', () => {
  it('T20 all twelve render, in the specified order', () => {
    renderFor([...win(25), ...loss(25)])
    const rendered = Array.from(
      document.querySelectorAll<HTMLElement>('[data-state]'),
    ).map((el) => el.getAttribute('data-testid')!.replace('tile-', ''))
    expect(rendered).toEqual(ORDER)
  })

  it('T21 gross - fees == net, read from the RENDERED tiles', () => {
    renderFor([...win(25), ...loss(25), ...scratch(3)])
    expect(Number((numOf('gross') - numOf('fees')).toFixed(2))).toBe(numOf('net'))
  })

  it('T22 winners + losers + scratches == trade count, from the rendered tiles', () => {
    const m = renderFor([...win(25), ...loss(25), ...scratch(3)])
    expect(m.winners + m.losers + m.scratches).toBe(numOf('count'))
  })

  it('T23 Win Rate denominator is winners + losers — scratches EXCLUDED', () => {
    renderFor([...win(25), ...loss(25), ...scratch(9)])
    expect(denOf('winrate')).toBe('25 W / 25 L')
    expect(denOf('winrate')).not.toContain('59')
  })

  it('T24 P&L Ratio equals avgWinner / abs(avgLoser) as rendered', () => {
    renderFor([...win(25), ...loss(25)])
    expect(Number((numOf('avgwin') / Math.abs(numOf('avgloss'))).toFixed(2))).toBe(
      numOf('plratio'),
    )
  })

  it('T25 THE THREE STATES for every guarded tile', () => {
    // NONE — no decided trades at all, no risk logged.
    renderFor(scratch(4))
    for (const t of GUARDED) expect(stateOf(t)).toBe('none')
    for (const t of GUARDED) expect(denOf(t)).toBeTruthy() // denominator still shown

    // THIN — a real but sub-floor denominator.
    document.body.innerHTML = ''
    renderFor([...win(5), ...loss(5), ...win(5, { r_multiple: 2 })])
    for (const t of GUARDED) expect(stateOf(t)).toBe('thin')
    expect(valueOf('winrate')).not.toBe('') // the value IS shown, just muted
    expect(denOf('winrate')).toContain('10 W / 5 L') // denominator still visible
    expect(denOf('winrate')).toContain('thin sample') // and visibly caveated

    // OK — at or above the floor.
    document.body.innerHTML = ''
    renderFor([...win(20, { r_multiple: 2 }), ...loss(20)])
    for (const t of GUARDED) expect(stateOf(t)).toBe('ok')
  })

  it('T26 P&L Ratio needs BOTH sides: 25 winners and 3 losers is THIN, not OK', () => {
    renderFor([...win(25), ...loss(3)])
    expect(stateOf('plratio')).toBe('thin')
    expect(stateOf('avgwin')).toBe('ok') // 25 winners clears on its own
    expect(stateOf('avgloss')).toBe('thin') // 3 losers does not
  })

  it('T27 absolute tiles are UNGUARDED at a denominator of one', () => {
    renderFor(win(1))
    for (const t of ABSOLUTE) expect(stateOf(t)).toBe('absolute')
    expect(numOf('net')).toBe(100)
    expect(numOf('gross')).toBe(110)
    expect(numOf('fees')).toBe(10)
    expect(numOf('count')).toBe(1)
    expect(numOf('largestwin')).toBe(100)
  })

  it('T28 STAND-DOWN: a full book renders every guarded tile OK', () => {
    renderFor([...win(30, { r_multiple: 2 }), ...loss(30)])
    for (const t of GUARDED) expect(stateOf(t)).toBe('ok')
  })

  it('T29 Net P&L carries no trade-count subtitle — Trade Count owns it', () => {
    renderFor([...win(25), ...loss(25)])
    expect(within(tile('net')).queryByTestId('tile-den')).toBeNull()
    expect(tile('net').textContent).not.toMatch(/\d+\s+trades?/i)
  })
})

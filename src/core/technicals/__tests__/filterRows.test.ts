import { describe, it, expect } from 'vitest'
import { filterRows } from '../filterRows'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

// Minimal TradeWithTechnicalsRow fixture. filterRows only reads `symbol`
// and `playbook_name`; every other field is a plausible stub (technicals
// left null since the filter never inspects it).
function makeRow(
  id: number,
  symbol: string,
  playbookName: string | null,
): TradeWithTechnicalsRow {
  return {
    id,
    symbol,
    date: '2026-05-15',
    side: 'long',
    net_pnl: 0,
    open_time: '2026-05-15T13:45:00.000Z',
    playbook_id: playbookName === null ? null : id,
    playbook_name: playbookName,
    technicals: null,
  }
}

const ROWS: TradeWithTechnicalsRow[] = [
  makeRow(1, 'SPRC', 'Bull Flag'),
  makeRow(2, 'SPRC', 'Gap Go'),
  makeRow(3, 'TSLA', 'Bull Flag'),
  makeRow(4, 'AAPL', null),
  makeRow(5, 'SPY', 'Bull Flag'),
]

const ids = (rows: TradeWithTechnicalsRow[]): number[] => rows.map((r) => r.id)

describe('filterRows', () => {
  it('(a) empty ticker + null playbook → all rows unchanged', () => {
    expect(ids(filterRows(ROWS, '', null))).toEqual([1, 2, 3, 4, 5])
  })

  it("(b) ticker 'SPRC' → only SPRC rows", () => {
    expect(ids(filterRows(ROWS, 'SPRC', null))).toEqual([1, 2])
  })

  it("(c) ticker 'sprc' (lowercase) → same result (case-insensitive)", () => {
    expect(ids(filterRows(ROWS, 'sprc', null))).toEqual([1, 2])
  })

  it("(d) ticker 'SP' (partial) → contains-match (SPRC + SPY, not TSLA)", () => {
    expect(ids(filterRows(ROWS, 'SP', null))).toEqual([1, 2, 5])
  })

  it("(e) playbook 'Bull Flag' → only exact playbook matches", () => {
    expect(ids(filterRows(ROWS, '', 'Bull Flag'))).toEqual([1, 3, 5])
  })

  it("(f) playbook 'Bull Flag' → row with null playbook_name excluded", () => {
    const out = filterRows(ROWS, '', 'Bull Flag')
    expect(ids(out)).not.toContain(4)
    expect(out.every((r) => r.playbook_name === 'Bull Flag')).toBe(true)
  })

  it("(g) ticker 'SPRC' + playbook 'Bull Flag' → AND of both filters", () => {
    expect(ids(filterRows(ROWS, 'SPRC', 'Bull Flag'))).toEqual([1])
  })

  it('(h) empty input array → empty result for any filter values', () => {
    expect(filterRows([], 'SPRC', 'Bull Flag')).toEqual([])
    expect(filterRows([], '', null)).toEqual([])
  })
})

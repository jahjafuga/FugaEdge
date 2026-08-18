// @vitest-environment jsdom
// v0.2.7 Feature 2, Commit 1 — one table, not two.
//
// The per-playbook breakdown rendered its OWN <table> inside a colSpan cell of the
// parent's. Two independent tables mean two independent column algorithms, so the
// child's Trades column had no structural reason to line up with the parent's — it
// only ever agreed by coincidence of padding. Making the children rows of the SAME
// table makes misalignment impossible rather than merely unlikely.

import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TierPerformanceCard from '@/components/analytics/TierPerformanceCard'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

const t = (o: Partial<TradeListRow>) => makeTrade(o)

const TRADES: TradeListRow[] = [
  t({ id: 1, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: 100 }),
  t({ id: 2, playbook_id: 1, playbook_name: 'Bull Flag', playbook_tier: 'A+', net_pnl: -50 }),
  t({ id: 3, playbook_id: 2, playbook_name: 'ABCD', playbook_tier: 'A+', net_pnl: 30 }),
  t({ id: 4, playbook_id: 3, playbook_name: 'Micro Pullback', playbook_tier: 'B', net_pnl: 20 }),
  // A playbook with NO tier -> the gradeless No-Setup row (primaryState: a null
  // playbook_id is 'untagged' and never reaches the table at all).
  t({ id: 5, playbook_id: 9, playbook_name: 'Ungraded', playbook_tier: null, net_pnl: -7 }),
]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup(trades: TradeListRow[] = TRADES) {
  const r = render(<TierPerformanceCard trades={trades} />)
  return r.container
}
const expandFirstTier = (c: HTMLElement) => {
  const row = c.querySelector<HTMLElement>('tr[aria-expanded]')!
  fireEvent.click(row)
  act(() => { vi.advanceTimersByTime(400) })
}
const tables = (c: HTMLElement) => c.querySelectorAll('table')
const cellsOf = (tr: Element) => tr.querySelectorAll(':scope > td').length

describe('TierPerformanceCard — one table', () => {
  it('T1 parent and child rows render inside ONE table element', () => {
    const c = setup()
    expandFirstTier(c)
    expect(tables(c).length).toBe(1)
    // and the child rows really are in it
    expect(c.querySelector('[data-row="playbook"]')).not.toBeNull()
    expect(c.querySelector('[data-row="playbook"]')!.closest('table')).toBe(tables(c)[0])
  })

  it('T2 a parent row and a child row have the SAME cell count', () => {
    const c = setup()
    expandFirstTier(c)
    const parent = c.querySelector('[data-row="tier"]')!
    const child = c.querySelector('[data-row="playbook"]')!
    expect(cellsOf(child)).toBe(cellsOf(parent))
  })

  it('T3 the child indents its first cell and its SETUPS cell is present-but-empty', () => {
    const c = setup()
    expandFirstTier(c)
    const child = c.querySelector('[data-row="playbook"]')!
    const cells = child.querySelectorAll(':scope > td')
    expect(cells[0].getAttribute('data-indent')).toBe('true')
    // Present in the DOM, carrying no value — absent would shift every column after it.
    expect(cells[1].textContent!.trim()).toBe('')
  })

  it('T4 STAND-DOWN: collapsed, the same tier rows render as before', () => {
    const c = setup()
    const tierRows = c.querySelectorAll('[data-row="tier"]')
    expect(tierRows.length).toBe(2) // A+ and B
    expect(c.querySelectorAll('[data-row="playbook"]').length).toBe(0)
    expect(c.querySelector('[data-row="nosetup"]')).not.toBeNull()
  })

  it('T5 HEALTHY: the gradeless No-Setup row survives, and a tier with no playbooks is inert', () => {
    const c = setup()
    const noSetup = c.querySelector('[data-row="nosetup"]')!
    expect(cellsOf(noSetup)).toBe(cellsOf(c.querySelector('[data-row="tier"]')!))
    // Only rows with playbooks are expandable.
    expect(c.querySelectorAll('tr[aria-expanded]').length).toBe(2)
    expect(noSetup.getAttribute('aria-expanded')).toBeNull()
  })

  it('T6 the values are untouched — net, win %, expectancy and P/L ratio read the same', () => {
    const c = setup()
    const aPlus = c.querySelector('[data-row="tier"]')!
    const text = aPlus.textContent!
    expect(text).toContain('2W / 1L')
    expect(text).toContain('+$80.00') // 100 - 50 + 30
    expect(text).toContain('67%') // 2 of 3 decided
  })
})

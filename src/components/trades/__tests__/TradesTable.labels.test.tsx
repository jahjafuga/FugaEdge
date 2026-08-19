// @vitest-environment jsdom
// v0.2.7 Feature 4, Commit 4 — the Columns menu speaks English.
//
// The menu listed raw column ids: pnl_gain_pct, days_since_catalyst, avg_buy. That
// reads as a debug panel, and it made the feature's own surface the least legible
// thing on the page. Each column now declares a label IN THE REGISTRY, beside itself,
// so the menu and the header read one string and a new column cannot be added without
// one — which T20 enforces over the whole registry rather than a sampled few.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
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
const TRADES: TradeListRow[] = [makeTrade({ id: 1, symbol: 'VEEE' })]

beforeEach(() => localStorage.clear())
const openMenu = () => fireEvent.click(screen.getByTestId('columns-button'))

describe('column labels', () => {
  it('T20 EVERY column in the registry has a label that is not its raw id', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    const toggles = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="col-toggle-"]'),
    )
    expect(toggles.length).toBeGreaterThan(20) // the whole registry, not a sample
    for (const t of toggles) {
      const id = t.getAttribute('data-testid')!.replace('col-toggle-', '')
      const label = t.textContent!.trim()
      expect(label, `${id} has no label`).not.toBe('')
      // A label equal to the id means someone added a column and skipped the label.
      expect(label, `${id} still shows its raw id`).not.toBe(id)
      expect(label, `${id} label looks like an id`).not.toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/)
    }
  })

  it('T21 the menu renders labels, not ids', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    openMenu()
    const menu = screen.getByTestId('columns-menu')
    expect(menu.textContent).toContain('Gain %')
    // Shortened when every column got a real width: nineteen characters over a
    // three-digit number forced the header to wrap, which changed the height of
    // the whole header row depending on what was visible.
    expect(menu.textContent).toContain('Catalyst age')
    expect(menu.textContent).not.toContain('pnl_gain_pct')
    expect(menu.textContent).not.toContain('days_since_catalyst')
  })

  it('T22 a header renders the SAME label the menu shows — one source', () => {
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ mae: true, hold_time: true }))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const headers = Array.from(document.querySelectorAll('thead th')).map(
      (e) => e.textContent?.trim() ?? '',
    )
    openMenu()
    const labelOf = (id: string) =>
      screen.getByTestId(`col-toggle-${id}`).textContent!.trim()
    expect(headers).toContain(labelOf('mae'))
    expect(headers).toContain(labelOf('hold_time'))
    expect(headers).toContain(labelOf('symbol'))
  })

  it('T23 STAND-DOWN: column IDS are unchanged, so old persisted visibility resolves', () => {
    // A store written before this commit keys on ids, not labels.
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ rvol: true, catalyst: true }))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const headers = Array.from(document.querySelectorAll('thead th')).map(
      (e) => e.textContent?.trim() ?? '',
    )
    expect(headers).toContain('RVOL')
    expect(headers).toContain('Catalyst')
  })
})

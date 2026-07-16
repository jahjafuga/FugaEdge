// @vitest-environment jsdom
//
// Dave #14 (A) — EXTRACTION PARITY PIN. MultiSelectMenu moves out of
// AnalyticsFilterBar into a shared ui/ component so the Compare tab can
// reuse it without a scope-clone. AnalyticsFilterBar had no dedicated
// suite (recon fact), so this file IS the parity evidence: it is written
// against the PRE-extraction private component and must pass unchanged
// through the extraction — pinning the bar's multi-select behavior
// byte-for-byte across the move. No mocks needed: the bar is a pure
// controlled component (trades + filters in, onFiltersChange out).

import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'
import {
  emptyFilters,
  type OverviewFilters,
} from '@/core/performance'
import AnalyticsFilterBar, { rangeForQuickKey, type QuickKey } from '../AnalyticsFilterBar'

const TRADES: TradeListRow[] = [
  makeTrade({ id: 1, mistakes: ['FOMO'], playbook_name: 'Gap & Go', catalyst_type: 'Earnings' }),
  makeTrade({ id: 2, mistakes: ['Chased', 'FOMO'] }),
  makeTrade({ id: 3 }),
]

// Mirrors the OverviewTab host wiring — the bar is controlled, so a tiny
// stateful host lets the pins observe real round-trip behavior.
function Host({ trades }: { trades: TradeListRow[] }) {
  const [filters, setFilters] = useState<OverviewFilters>(() => ({
    ...emptyFilters(),
    range: rangeForQuickKey('7d'),
  }))
  const [quick, setQuick] = useState<QuickKey>('7d')
  return (
    <AnalyticsFilterBar
      trades={trades}
      filters={filters}
      onFiltersChange={setFilters}
      quick={quick}
      onQuickChange={setQuick}
    />
  )
}

const moreFilters = () => screen.getByRole('button', { name: /more filters/i })
const trigger = (label: RegExp) => screen.getByRole('button', { name: label })

function openMistakeMenu() {
  fireEvent.click(moreFilters())
  fireEvent.click(trigger(/^mistake/i))
}

describe('AnalyticsFilterBar — multi-select behavior across the MultiSelectMenu extraction', () => {
  it('the expander reveals the three menus; the Mistake menu lists distinct sorted labels', () => {
    render(<Host trades={TRADES} />)
    expect(moreFilters().getAttribute('aria-expanded')).toBe('false')
    openMistakeMenu()
    expect(moreFilters().getAttribute('aria-expanded')).toBe('true')
    // Deduped (FOMO on two trades -> one option), sorted (Chased first).
    expect(screen.getAllByText('FOMO')).toHaveLength(1)
    const chased = screen.getByText('Chased')
    const fomo = screen.getByText('FOMO')
    // eslint-disable-next-line no-bitwise
    expect((chased.compareDocumentPosition(fomo) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
  })

  it('toggling options builds the union list, shows the count badge, and toggling off removes', () => {
    render(<Host trades={TRADES} />)
    openMistakeMenu()

    fireEvent.click(screen.getByRole('button', { name: 'FOMO' }))
    expect(within(trigger(/^mistake/i)).getByText('1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Chased' }))
    expect(within(trigger(/^mistake/i)).getByText('2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'FOMO' }))
    expect(within(trigger(/^mistake/i)).getByText('1')).toBeTruthy()
  })

  it('Clear empties the selection and the badge disappears', () => {
    render(<Host trades={TRADES} />)
    openMistakeMenu()
    fireEvent.click(screen.getByRole('button', { name: 'FOMO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chased' }))

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(within(trigger(/^mistake/i)).queryByText('2')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('a hidden active filter tints the collapsed "More filters" button (moreActive signal)', () => {
    render(<Host trades={TRADES} />)
    openMistakeMenu()
    fireEvent.click(screen.getByRole('button', { name: 'FOMO' }))
    // Collapse the expander — the active-underneath tint must survive.
    fireEvent.click(moreFilters())
    expect(moreFilters().getAttribute('aria-expanded')).toBe('false')
    expect(moreFilters().className).toContain('border-gold/50')
  })

  it('the sibling menus ride the same component: Playbook and Catalyst still list their options', () => {
    render(<Host trades={TRADES} />)
    fireEvent.click(moreFilters())
    fireEvent.click(trigger(/^playbook/i))
    expect(screen.getByText('Gap & Go')).toBeTruthy()
    // Close via the click-away catcher path is internal; open Catalyst directly —
    // each menu owns its open state, so both can be exercised in sequence.
    fireEvent.click(trigger(/^catalyst/i))
    expect(screen.getByText('Earnings')).toBeTruthy()
  })

  it('empty book: the menu renders the honest "No options yet."', () => {
    render(<Host trades={[makeTrade({ id: 9 })]} />)
    openMistakeMenu()
    expect(screen.getByText('No options yet.')).toBeTruthy()
  })
})

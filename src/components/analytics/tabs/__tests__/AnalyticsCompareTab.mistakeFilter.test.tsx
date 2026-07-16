// @vitest-environment jsdom
//
// Dave #14 (A) — MISTAKE FILTER ON COMPARE. The 41cf12d minimal-promote
// passed ALL trades and dropped the old Reports filter-bar cross-filter;
// this beat recovers ONE dimension of it — a mistake-only multi-select
// above CompareView — using the recovered filter-then-compare wiring
// (b88d290^'s `applyFilters(trades, { ...filters, range: null })`,
// narrowed to the mistake dimension). Full FilterBar parity stays
// earmarked for the flagship redesign arc.
//
// THE GROWTH GATE: the 'Net P&L (% of contributed)' row divides the
// period's net P&L by CONTRIBUTED CAPITAL from the cash ledger. Under an
// active mistake filter the numerator would be a filtered subset while
// the denominator stays whole-account — a ratio that must NEVER render.
// The row hides behind an honest sub-line and returns UNCHANGED when the
// filter clears (the denominator never saw the filter).
//
// Fixture math (single anchored account, contributed 6,300):
//   Period A (06-08..14): +130 clean, -43.21 FOMO, +24.68 Chased -> net +111.47 -> 1.8%
//   Period B (06-01..07): +130 clean, -67.89 [FOMO, Sized too big] -> net +62.11 -> 1.0%
//   FOMO filter:       A -> -43.21, B -> -67.89 (forbidden ratios: -0.7% / -1.1%)
//   FOMO union Chased: A -> -18.53, B -> -67.89 (union — either label passes)
//   Chased only:       A -> +24.68, B -> empty (house zero-trades honesty)

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance } from '@shared/cash-types'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    sessionListAll: vi.fn(),
    accountsList: vi.fn(),
    cashBalanceGet: vi.fn(),
  },
}))

import AnalyticsCompareTab from '../AnalyticsCompareTab'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// jsdom ships no ResizeObserver; recharts' ResponsiveContainer requires one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const MAIN: Account = {
  id: 'MAIN',
  name: 'Main account',
  broker: null,
  account_type: 'margin',
  color: null,
  status: 'active',
  is_default: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

const MAIN_BALANCE: AccountBalance = {
  account_id: 'MAIN',
  anchor_date: '2026-05-01',
  starting: 6300,
  deposits: 0,
  withdrawals: 0,
  net_pnl: 0,
  balance: 6300,
}

const RANGE_A = { from: '2026-06-08', to: '2026-06-14' }
const RANGE_B = { from: '2026-06-01', to: '2026-06-07' }

function tr(over: Partial<TradeListRow>): TradeListRow {
  // gross = net, zero fees — every money row derives from the same figure,
  // so the unique-cents pins below can't collide with a fee/gross residue.
  return makeTrade({ gross_pnl: over.net_pnl, total_fees: 0, ...over })
}

const TRADES: TradeListRow[] = [
  tr({ id: 1, date: '2026-06-09', net_pnl: 130 }),
  tr({ id: 2, date: '2026-06-10', net_pnl: -43.21, mistakes: ['FOMO'] }),
  tr({ id: 3, date: '2026-06-11', net_pnl: 24.68, mistakes: ['Chased'] }),
  tr({ id: 4, date: '2026-06-02', net_pnl: 130 }),
  tr({ id: 5, date: '2026-06-03', net_pnl: -67.89, mistakes: ['FOMO', 'Sized too big'] }),
]

beforeEach(() => {
  vi.clearAllMocks()
  m.sessionListAll.mockResolvedValue([])
  m.accountsList.mockResolvedValue([MAIN])
  m.cashBalanceGet.mockResolvedValue(MAIN_BALANCE)
})

function renderTab(trades: TradeListRow[] = TRADES) {
  render(<AnalyticsCompareTab trades={trades} initialRangeA={RANGE_A} initialRangeB={RANGE_B} />)
}

const ROW_LABEL = 'Net P&L (% of contributed)'
const mistakeTrigger = () => screen.getByRole('button', { name: /^mistake/i })
const option = (label: string) => screen.getByRole('button', { name: label })

describe('AnalyticsCompareTab — mistake filter (Dave #14 A)', () => {
  it('(1) THE RECOVERY: picking a mistake narrows BOTH periods through computePeriodComparison', async () => {
    renderTab()
    // Unfiltered headline settles first: A +111.47, B +62.11.
    expect((await screen.findAllByText('+$111.47')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('+$62.11').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(mistakeTrigger())
    fireEvent.click(option('FOMO'))

    // Both periods recomputed over the narrowed rows — the unfiltered
    // figures are gone from BOTH columns, the narrowed ones render.
    await waitFor(() => expect(screen.getAllByText('-$43.21').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('-$67.89').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText('+$111.47')).toHaveLength(0)
    expect(screen.queryAllByText('+$62.11')).toHaveLength(0)
  })

  it('(2) MULTI-SELECT: two mistakes are a union — a trade with EITHER label passes', async () => {
    renderTab()
    await screen.findAllByText('+$111.47')

    fireEvent.click(mistakeTrigger())
    fireEvent.click(option('FOMO'))
    fireEvent.click(option('Chased'))

    // A = FOMO trade (-43.21) + Chased-only trade (+24.68) = -18.53. The
    // Chased-only trade passing alongside the FOMO one IS the union pin —
    // an intersection would leave A at -43.21 (no trade carries both).
    await waitFor(() => expect(screen.getAllByText('-$18.53').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('-$67.89').length).toBeGreaterThanOrEqual(1)
  })

  it('(3) EMPTY-SAFE: a mistake with zero trades in one period keeps the house zero-trades honesty — no NaN, no crash', async () => {
    renderTab()
    await screen.findAllByText('+$111.47')

    fireEvent.click(mistakeTrigger())
    fireEvent.click(option('Chased'))

    // Period A narrows to the lone Chased trade; period B has none.
    await waitFor(() => expect(screen.getAllByText('+$24.68').length).toBeGreaterThanOrEqual(1))
    expect(screen.getByText(/One of the periods has zero trades/i)).toBeTruthy()
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('(4) GROWTH GATE: filter active -> row hidden behind the honest sub-line; cleared -> ledger values return UNCHANGED', async () => {
    renderTab()
    // Phase 1 — unfiltered: the % row renders over contributed 6,300 with
    // the shipped masked-money marker (1.8% / 1.0%).
    await waitFor(() => expect(screen.getAllByText('1.8%').length).toBeGreaterThanOrEqual(1))
    expect(screen.getByText(ROW_LABEL)).toBeTruthy()
    expect(screen.getAllByText('1.8%')[0].closest('.masked-money')).toBeTruthy()
    expect(screen.getAllByText('1.0%')[0].closest('.masked-money')).toBeTruthy()

    // Phase 2 — filter on: the row is gone, the honest sub-line renders in
    // its place, and NO filtered-numerator/whole-denominator ratio exists
    // anywhere (-43.21/6300 -> -0.7%, -67.89/6300 -> -1.1%).
    fireEvent.click(mistakeTrigger())
    fireEvent.click(option('FOMO'))
    await waitFor(() => expect(screen.queryByText(ROW_LABEL)).toBeNull())
    expect(screen.getByText(/hidden while filters are active/i)).toBeTruthy()
    expect(screen.queryAllByText('1.8%')).toHaveLength(0)
    expect(screen.queryAllByText('1.0%')).toHaveLength(0)
    expect(screen.queryByText('-0.7%')).toBeNull()
    expect(screen.queryByText('-1.1%')).toBeNull()

    // Phase 3 — cleared: the row returns with the SAME ledger-backed values
    // (the denominator never saw the filter; cc was never refetched).
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.getByText(ROW_LABEL)).toBeTruthy())
    expect(screen.getAllByText('1.8%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1.0%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1.8%')[0].closest('.masked-money')).toBeTruthy()
    expect(screen.queryByText(/hidden while filters are active/i)).toBeNull()
  })

  it('(6) distinctMistakes feeds the picker: junction-fed, sorted, deduped', async () => {
    renderTab()
    await screen.findAllByText('+$111.47')

    fireEvent.click(mistakeTrigger())
    // Deduped: FOMO carried by two trades -> exactly one option.
    expect(screen.getAllByText('FOMO')).toHaveLength(1)
    expect(screen.getAllByText('Chased')).toHaveLength(1)
    expect(screen.getAllByText('Sized too big')).toHaveLength(1)
    // Sorted: Chased < FOMO < Sized too big in document order.
    const chased = screen.getByText('Chased')
    const fomo = screen.getByText('FOMO')
    const sized = screen.getByText('Sized too big')
    // eslint-disable-next-line no-bitwise
    expect((chased.compareDocumentPosition(fomo) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
    // eslint-disable-next-line no-bitwise
    expect((fomo.compareDocumentPosition(sized) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
  })

  it('(6b) empty book: the picker stays honest — "No options yet."', async () => {
    renderTab([tr({ id: 9, date: '2026-06-09', net_pnl: 130 })])
    await screen.findAllByText('+$130.00')

    fireEvent.click(mistakeTrigger())
    expect(screen.getByText('No options yet.')).toBeTruthy()
  })
})

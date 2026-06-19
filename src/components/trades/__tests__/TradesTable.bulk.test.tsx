import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { signed } from '@/lib/format'
import TradesTable from '../TradesTable'

// TradesTable renders TradeDetailModal, which (via PlaybookPicker) calls
// ipc.playbooksList() on mount. Stub the whole ipc surface so the table renders
// in jsdom without a real preload bridge (same pattern as the lifecycle test).
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// Make every row "visible" under jsdom (the real virtualizer renders 0 rows
// because clientHeight is 0). Shared passthrough — see src/test/mockVirtualizer.
// The factory imports lazily so vi.mock hoisting doesn't trip over the import.
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}

let nextId = 1
function makeTrade(overrides: Partial<TradeListRow> = {}): TradeListRow {
  const id = overrides.id ?? nextId++
  return {
    id,
    date: '2026-05-20',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-05-20T13:00:00.000Z',
    close_time: '2026-05-20T14:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    ...overrides,
  }
}

// Five distinct symbols, open_time descending so the default sort renders them
// AAA, BBB, CCC, DDD, EEE — a stable order for range-select assertions.
function fiveTrades(): TradeListRow[] {
  return [
    makeTrade({ id: 1, symbol: 'AAA', open_time: '2026-05-20T13:05:00.000Z', net_pnl: 100 }),
    makeTrade({ id: 2, symbol: 'BBB', open_time: '2026-05-20T13:04:00.000Z', net_pnl: 50 }),
    makeTrade({ id: 3, symbol: 'CCC', open_time: '2026-05-20T13:03:00.000Z', net_pnl: -30 }),
    makeTrade({ id: 4, symbol: 'DDD', open_time: '2026-05-20T13:02:00.000Z', net_pnl: 20 }),
    makeTrade({ id: 5, symbol: 'EEE', open_time: '2026-05-20T13:01:00.000Z', net_pnl: -10 }),
  ]
}

// The non-trades props never vary across these tests, so the helper carries
// them and each test passes only `trades` + any one-off override (typically its
// own onBulkSoftDelete spy). Kept deliberately thin — not a fixture factory.
const DEFAULT_PROPS = {
  onSaveNote: noop,
  onSaveTimeframe: noop,
  onSavePlaybook: noop,
  onSaveConfidence: noop,
  onSaveMistakes: noop,
  onSavePlannedRisk: noop,
  onSavePlannedStopLoss: noop,
  onSaveFloat: noop,
  onSaveCatalyst: noop,
  onSaveCountry: noop,
  showCountryColumn: false,
}

type Overrides = Partial<ComponentProps<typeof TradesTable>>

function tableEl(trades: TradeListRow[], overrides: Overrides) {
  return <TradesTable {...DEFAULT_PROPS} {...overrides} trades={trades} />
}

function renderWith(trades: TradeListRow[] = fiveTrades(), overrides: Overrides = {}) {
  const onBulkSoftDelete =
    overrides.onBulkSoftDelete ?? vi.fn(async (_ids: number[]) => {})
  const utils = render(tableEl(trades, { ...overrides, onBulkSoftDelete }))
  // Re-render with the SAME spy so call assertions survive a filter change.
  const rerenderWith = (next: TradeListRow[], o: Overrides = {}) =>
    utils.rerender(tableEl(next, { ...o, onBulkSoftDelete }))
  return { ...utils, onBulkSoftDelete, trades, rerenderWith }
}

// All checkboxes in DOM order: [0] = header select-all, [1..] = rows (sorted).
const allCheckboxes = () =>
  screen.getAllByRole('checkbox') as HTMLInputElement[]
const headerCheckbox = () => allCheckboxes()[0]
const rowCheckbox = (i: number) => allCheckboxes()[i + 1]

// The bar's "N selected" label (count is a nested <span>, so match by the
// parent span's normalized textContent).
const countLabel = (n: number) =>
  screen.getByText(
    (_, el) =>
      el?.tagName === 'SPAN' &&
      el.classList.contains('font-semibold') &&
      (el.textContent ?? '') === `${n} selected`,
  )
const queryCountLabel = (n: number) =>
  screen.queryByText(
    (_, el) =>
      el?.tagName === 'SPAN' &&
      el.classList.contains('font-semibold') &&
      (el.textContent ?? '') === `${n} selected`,
  )

// The bar's trigger is exactly "Move to Trash"; the ConfirmModal confirm button
// is "Move N to Trash", so this disambiguates bar-visible from modal-open.
const barTrigger = () => screen.queryByRole('button', { name: 'Move to Trash' })

describe('TradesTable — bulk selection', () => {
  it('renders a checkbox per row + a select-all header checkbox', () => {
    renderWith()
    // 5 rows + 1 header = 6.
    expect(allCheckboxes()).toHaveLength(6)
  })

  it('no action bar until at least one row is selected', () => {
    renderWith()
    expect(barTrigger()).toBeNull()
  })

  it('selecting rows shows the bar with the combined Net P&L; row click does not open the detail modal; no restore affordance', () => {
    renderWith()
    // AAA (100) + CCC (-30) = 70 — a sum no single row carries.
    fireEvent.click(rowCheckbox(0))
    fireEvent.click(rowCheckbox(2))
    expect(countLabel(2)).toBeTruthy()
    expect(screen.getByText(signed(70))).toBeTruthy()
    // The checkbox click must not bubble to the row's open-modal handler.
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
    // Q3: P4 is soft-delete ONLY — no bulk restore UI leaks into the table.
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
  })

  it('header checkbox selects all, then clears (tri-state)', () => {
    renderWith()
    fireEvent.click(headerCheckbox())
    expect(countLabel(5)).toBeTruthy()
    expect(headerCheckbox().checked).toBe(true)
    expect(headerCheckbox().indeterminate).toBe(false)
    fireEvent.click(headerCheckbox())
    expect(barTrigger()).toBeNull()
  })

  it('header is indeterminate when only some rows are selected', () => {
    renderWith()
    fireEvent.click(rowCheckbox(0))
    expect(headerCheckbox().checked).toBe(false)
    expect(headerCheckbox().indeterminate).toBe(true)
  })

  it('shift-click selects a contiguous range over the sorted rows', () => {
    renderWith()
    fireEvent.click(rowCheckbox(0)) // anchor on AAA
    fireEvent.click(rowCheckbox(3), { shiftKey: true }) // extend to DDD
    // AAA, BBB, CCC, DDD = 4.
    expect(countLabel(4)).toBeTruthy()
  })

  it('Clear empties the selection', () => {
    renderWith()
    fireEvent.click(headerCheckbox())
    expect(countLabel(5)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(barTrigger()).toBeNull()
  })

  it('Escape clears the selection when no modal is open', async () => {
    const user = userEvent.setup()
    renderWith()
    fireEvent.click(rowCheckbox(0))
    expect(countLabel(1)).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(barTrigger()).toBeNull()
  })

  it('Escape with the confirm modal open closes the modal and KEEPS the selection', async () => {
    const user = userEvent.setup()
    renderWith()
    fireEvent.click(headerCheckbox())
    await user.click(barTrigger() as HTMLElement)
    // Confirm modal is open (recovery note visible).
    expect(await screen.findByText(/restore them from Trash for 30 days/i)).toBeTruthy()
    await user.keyboard('{Escape}')
    // Modal closed…
    expect(screen.queryByText(/restore them from Trash for 30 days/i)).toBeNull()
    // …but the selection survived (bar trigger + count still present).
    expect(barTrigger()).toBeTruthy()
    expect(countLabel(5)).toBeTruthy()
  })

  it('confirm body lists the first 3 DISTINCT symbols + combined Net P&L, and confirm fires onBulkSoftDelete once with the exact ids', async () => {
    const user = userEvent.setup()
    // AAA repeated to prove distinct-not-first-3-rows; net_pnl sums to 150.
    const trades = [
      makeTrade({ id: 1, symbol: 'AAA', open_time: '2026-05-20T13:05:00.000Z', net_pnl: 10 }),
      makeTrade({ id: 2, symbol: 'AAA', open_time: '2026-05-20T13:04:00.000Z', net_pnl: 20 }),
      makeTrade({ id: 3, symbol: 'BBB', open_time: '2026-05-20T13:03:00.000Z', net_pnl: 30 }),
      makeTrade({ id: 4, symbol: 'CCC', open_time: '2026-05-20T13:02:00.000Z', net_pnl: 40 }),
      makeTrade({ id: 5, symbol: 'DDD', open_time: '2026-05-20T13:01:00.000Z', net_pnl: 50 }),
    ]
    const onBulkSoftDelete = vi.fn().mockResolvedValue(undefined)
    renderWith(trades, { onBulkSoftDelete })

    fireEvent.click(headerCheckbox())
    await user.click(barTrigger() as HTMLElement)

    const dialogs = screen.getAllByRole('dialog')
    const confirmDialog = dialogs[dialogs.length - 1]
    // 4 distinct symbols across 5 trades; first 3 distinct = AAA, BBB, CCC.
    expect(
      within(confirmDialog).getByText(
        'AAA, BBB, CCC and 2 more trades across 4 symbols',
      ),
    ).toBeTruthy()
    // Q4: the body shows the financial impact (combined Net P&L = 150). Scoped
    // to the dialog because the bar behind it shows the same total.
    expect(within(confirmDialog).getByText(signed(150))).toBeTruthy()

    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Move 5 to Trash' }),
    )
    expect(onBulkSoftDelete).toHaveBeenCalledTimes(1)
    expect(onBulkSoftDelete).toHaveBeenCalledWith([1, 2, 3, 4, 5])
  })

  it('reject keeps the selection and surfaces the error on the bar', async () => {
    const user = userEvent.setup()
    const onBulkSoftDelete = vi.fn().mockRejectedValue(new Error('disk busy'))
    renderWith(fiveTrades(), { onBulkSoftDelete })

    fireEvent.click(headerCheckbox())
    await user.click(barTrigger() as HTMLElement)
    const dialogs = screen.getAllByRole('dialog')
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole('button', {
        name: 'Move 5 to Trash',
      }),
    )

    // Error on the bar, selection retained for retry.
    expect(await screen.findByText('disk busy')).toBeTruthy()
    expect(countLabel(5)).toBeTruthy()
  })

  it('intersection guard: ids hidden by a filter drop out of the count and payload', async () => {
    const user = userEvent.setup()
    const onBulkSoftDelete = vi.fn().mockResolvedValue(undefined)
    const trades = fiveTrades()
    const { rerenderWith } = renderWith(trades, { onBulkSoftDelete })

    fireEvent.click(headerCheckbox()) // select all 5
    expect(countLabel(5)).toBeTruthy()

    // Re-render as if a filter now shows only AAA (id 1).
    rerenderWith([trades[0]])

    expect(countLabel(1)).toBeTruthy()
    await user.click(barTrigger() as HTMLElement)
    const dialogs = screen.getAllByRole('dialog')
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole('button', {
        name: 'Move 1 to Trash',
      }),
    )
    expect(onBulkSoftDelete).toHaveBeenCalledWith([1])
  })

  it('intersection guard prunes the internal Set, not just the derived view (re-widen stays pruned)', () => {
    const trades = fiveTrades()
    const { rerenderWith } = renderWith(trades)

    fireEvent.click(headerCheckbox()) // select all 5
    expect(countLabel(5)).toBeTruthy()

    // Narrow to just AAA — the guard must prune ids 2-5 from the Set itself.
    rerenderWith([trades[0]])
    expect(countLabel(1)).toBeTruthy()

    // Re-widen back to all five. If the Set were merely filtered downstream
    // (not pruned), ids 2-5 would still be selected and the count would jump
    // back to 5. Because the guard prunes the Set, the revealed rows return
    // UNSELECTED — count stays 1. This is the assertion that fails if the
    // prune effect is removed (the slow-memory-leak class of bug).
    rerenderWith(trades)
    expect(countLabel(1)).toBeTruthy()
    expect(queryCountLabel(5)).toBeNull()
  })

  it('caps the selection at 500 and shows the inline cap note', () => {
    const trades = Array.from({ length: 501 }, (_, i) =>
      makeTrade({ id: i + 1, symbol: `S${i}`, open_time: `2026-05-20T13:00:00.000Z` }),
    )
    renderWith(trades)
    fireEvent.click(headerCheckbox()) // select-all over 501 visible rows
    expect(countLabel(500)).toBeTruthy()
    expect(
      screen.getByText('500 selected (max). Use filters to narrow.'),
    ).toBeTruthy()
    // sanity: not 501
    expect(queryCountLabel(501)).toBeNull()
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import TrashSection from '../TrashSection'
import { ipc } from '@/lib/ipc'

// TrashSection self-fetches the deleted trades and drives the lifecycle IPCs.
// Stub the whole ipc surface it touches.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    tradesList: vi.fn(),
    tradeRestore: vi.fn(),
    tradesRestoreBulk: vi.fn(),
    tradeHardDelete: vi.fn(),
    tradesHardDeleteBulk: vi.fn(),
  },
}))

const tradesList = vi.mocked(ipc.tradesList)
const tradeRestore = vi.mocked(ipc.tradeRestore)
const tradesRestoreBulk = vi.mocked(ipc.tradesRestoreBulk)
const tradeHardDelete = vi.mocked(ipc.tradeHardDelete)
const tradesHardDeleteBulk = vi.mocked(ipc.tradesHardDeleteBulk)

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
    // All Trash rows are soft-deleted by definition.
    deleted_at: '2026-06-01 10:00:00',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tradeRestore.mockResolvedValue(undefined as never)
  tradesRestoreBulk.mockResolvedValue(undefined as never)
  tradeHardDelete.mockResolvedValue(undefined as never)
  tradesHardDeleteBulk.mockResolvedValue(undefined as never)
})

// Render, wait for the initial fetch to resolve, then expand the accordion.
// Text queries see through the collapsed (aria-hidden) body, but role queries
// (checkboxes, action buttons) don't — so we click the header open. jsdom has
// no localStorage here, so the accordion starts collapsed on every render.
async function renderOpen(trades: TradeListRow[]) {
  tradesList.mockResolvedValue(trades)
  render(<TrashSection />)
  if (trades.length === 0) {
    await screen.findByText('No deleted trades')
  } else {
    await screen.findByText(trades[0].symbol)
  }
  fireEvent.click(screen.getByRole('button', { name: /Trash/i }))
}

const dialog = () => screen.getByRole('dialog')

describe('TrashSection — load & layout', () => {
  it('queries only deleted trades', async () => {
    await renderOpen([])
    expect(tradesList).toHaveBeenCalledWith({ deleted: true })
  })

  it('shows the empty state when there are no deleted trades', async () => {
    await renderOpen([])
    expect(screen.getByText('No deleted trades')).toBeTruthy()
  })

  it('sorts most-recently-deleted first (deleted_at DESC)', async () => {
    await renderOpen([
      makeTrade({ id: 1, symbol: 'AAA', deleted_at: '2026-06-01 09:00:00' }),
      makeTrade({ id: 2, symbol: 'BBB', deleted_at: '2026-06-02 09:00:00' }),
    ])
    const symbols = screen.getAllByText(/^(AAA|BBB)$/).map((s) => s.textContent)
    expect(symbols).toEqual(['BBB', 'AAA'])
  })
})

describe('TrashSection — per-row actions', () => {
  it('restores a single trade and drops it from the list (no modal)', async () => {
    const user = userEvent.setup()
    await renderOpen([makeTrade({ id: 7, symbol: 'AAA' })])
    await user.click(screen.getByRole('button', { name: /^Restore AAA/ }))
    await waitFor(() => expect(tradeRestore).toHaveBeenCalledWith(7))
    expect(screen.queryByRole('dialog')).toBeNull() // restore is instant
    await waitFor(() => expect(screen.queryByText('AAA')).toBeNull())
    expect(screen.getByText('No deleted trades')).toBeTruthy()
  })

  it('delete-forever opens a count=1 type-to-confirm and hard-deletes on confirm', async () => {
    const user = userEvent.setup()
    await renderOpen([makeTrade({ id: 9, symbol: 'AAA' })])
    await user.click(screen.getByRole('button', { name: /^Delete AAA .* forever$/ }))

    // Count-scaled confirm: the user types "1".
    expect(within(dialog()).getByText('Type 1 to confirm')).toBeTruthy()
    const confirm = within(dialog()).getByRole('button', {
      name: 'Delete forever',
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    await user.type(within(dialog()).getByRole('textbox'), '1')
    expect(confirm.disabled).toBe(false)
    await user.click(confirm)

    await waitFor(() => expect(tradeHardDelete).toHaveBeenCalledWith(9))
    await waitFor(() => expect(screen.queryByText('AAA')).toBeNull())
  })
})

describe('TrashSection — bulk actions', () => {
  it('shows the bulk bar once a row is selected', async () => {
    const user = userEvent.setup()
    await renderOpen([makeTrade({ id: 1, symbol: 'AAA' }), makeTrade({ id: 2, symbol: 'BBB' })])
    expect(screen.queryByText('Combined Net P&L')).toBeNull()
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('Combined Net P&L')).toBeTruthy()
  })

  it('bulk-restores the selection atomically and clears it', async () => {
    const user = userEvent.setup()
    await renderOpen([
      makeTrade({ id: 1, symbol: 'AAA' }),
      makeTrade({ id: 2, symbol: 'BBB', deleted_at: '2026-06-02 09:00:00' }),
    ])
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.click(screen.getByRole('button', { name: 'Restore selected' }))

    await waitFor(() => expect(tradesRestoreBulk).toHaveBeenCalledTimes(1))
    // BBB sorts first (more recent), so the ids are [2, 1].
    expect(tradesRestoreBulk).toHaveBeenCalledWith([2, 1])
    await waitFor(() => expect(screen.getByText('No deleted trades')).toBeTruthy())
    // Bar gone (selection cleared).
    expect(screen.queryByText('Combined Net P&L')).toBeNull()
  })

  it('bulk delete-forever uses a count=N gate and hard-deletes on confirm', async () => {
    const user = userEvent.setup()
    await renderOpen([makeTrade({ id: 1, symbol: 'AAA' }), makeTrade({ id: 2, symbol: 'BBB' })])
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.click(screen.getByRole('button', { name: 'Delete selected forever' }))

    expect(within(dialog()).getByText('Type 2 to confirm')).toBeTruthy()
    await user.type(within(dialog()).getByRole('textbox'), '2')
    await user.click(within(dialog()).getByRole('button', { name: 'Delete forever' }))

    await waitFor(() => expect(tradesHardDeleteBulk).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('No deleted trades')).toBeTruthy())
  })

  it('surfaces an atomic bulk-restore reject on the bar and retains the selection', async () => {
    const user = userEvent.setup()
    tradesRestoreBulk.mockRejectedValue(new Error('disk on fire'))
    await renderOpen([makeTrade({ id: 1, symbol: 'AAA' }), makeTrade({ id: 2, symbol: 'BBB' })])
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.click(screen.getByRole('button', { name: 'Restore selected' }))

    expect(await screen.findByText('disk on fire')).toBeTruthy()
    // Selection retained for retry → rows + bar still present.
    expect(screen.getByText('Combined Net P&L')).toBeTruthy()
    expect(screen.getByText('AAA')).toBeTruthy()
    expect(screen.getByText('BBB')).toBeTruthy()
  })
})

describe('TrashSection — selection freeze (caller contract)', () => {
  it('does not change the displayed N when a checkbox is toggled while the Delete Forever modal is open', async () => {
    const user = userEvent.setup()
    await renderOpen([
      makeTrade({ id: 1, symbol: 'AAA', deleted_at: '2026-06-03 09:00:00' }),
      makeTrade({ id: 2, symbol: 'BBB', deleted_at: '2026-06-02 09:00:00' }),
      makeTrade({ id: 3, symbol: 'CCC', deleted_at: '2026-06-01 09:00:00' }),
    ])
    // Select two, open bulk delete-forever → N = 2.
    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[0])
    await user.click(boxes[1])
    await user.click(screen.getByRole('button', { name: 'Delete selected forever' }))
    expect(within(dialog()).getByText('Type 2 to confirm')).toBeTruthy()

    // Attempt to toggle the third (unselected) checkbox while the modal is open.
    fireEvent.click(screen.getAllByRole('checkbox')[2])

    // Frozen: the gate still reads 2, and the third box stayed unchecked.
    expect(within(dialog()).getByText('Type 2 to confirm')).toBeTruthy()
    expect((screen.getAllByRole('checkbox')[2] as HTMLInputElement).checked).toBe(false)
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import TradeDetailModal from '../TradeDetailModal'

// The Overview tab mounts PlaybookPicker, which calls ipc.playbooksList() on
// mount. Stub the whole ipc surface so the modal renders in jsdom without a
// real preload bridge. Any accessed method returns a resolved empty array —
// enough to keep mount-time effects from throwing.
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy(
    {},
    { get: () => () => Promise.resolve([]) },
  ),
}))

const noop = async () => {}

function makeTrade(overrides: Partial<TradeListRow> = {}): TradeListRow {
  return {
    id: 1,
    date: '2026-05-20',
    symbol: 'AAPL',
    side: 'long',
    open_time: '2026-05-20T13:30:00.000Z',
    close_time: '2026-05-20T14:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 2,
    net_pnl: 98,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
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
    deleted_at: null,
    ...overrides,
  }
}

function renderModal(props: Partial<ComponentProps<typeof TradeDetailModal>> = {}) {
  const onClose = vi.fn()
  render(
    <TradeDetailModal
      trade={makeTrade()}
      onClose={onClose}
      onSaveNote={noop}
      onSaveTimeframe={noop}
      onSavePlaybook={noop}
      onSaveConfidence={noop}
      onSaveMistakes={noop}
      onSavePlannedRisk={noop}
      onSavePlannedStopLoss={noop}
      onSaveFloat={noop}
      onSaveCatalyst={noop}
      onSaveCountry={noop}
      {...props}
    />,
  )
  return { onClose }
}

const RECOVERY_NOTE = 'You can restore this from Trash for 30 days.'

describe('TradeDetailModal — lifecycle footer', () => {
  it('live trade: "Move to Trash" opens ConfirmModal and confirm fires onSoftDelete once', async () => {
    const user = userEvent.setup()
    const onSoftDelete = vi.fn().mockResolvedValue(undefined)
    renderModal({ trade: makeTrade({ id: 7, deleted_at: null }), onSoftDelete })

    // Footer trigger present; no ConfirmModal yet (recovery note absent).
    expect(screen.queryByText(RECOVERY_NOTE)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }))

    // ConfirmModal opened — recovery note + preview now shown.
    expect(await screen.findByText(RECOVERY_NOTE)).toBeTruthy()
    const dialogs = screen.getAllByRole('dialog')
    const confirmDialog = dialogs[dialogs.length - 1]

    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Move to Trash' }),
    )
    expect(onSoftDelete).toHaveBeenCalledTimes(1)
    expect(onSoftDelete).toHaveBeenCalledWith(7)
  })

  it('deleted trade: "Restore" fires onRestore once with no ConfirmModal', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn().mockResolvedValue(undefined)
    renderModal({
      trade: makeTrade({ id: 9, deleted_at: '2026-05-21T00:00:00.000Z' }),
      onRestore,
    })

    expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Restore' }))

    // No confirm step for restore — the recovery note never appears.
    expect(screen.queryByText(RECOVERY_NOTE)).toBeNull()
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onRestore).toHaveBeenCalledWith(9)
  })

  it('no lifecycle props (calendar hosts): renders no footer action', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
    // The modal itself still renders (symbol shown in the header).
    expect(screen.getByText('AAPL')).toBeTruthy()
  })
})

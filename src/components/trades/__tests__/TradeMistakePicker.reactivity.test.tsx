// @vitest-environment jsdom
//
// Symptom B — a mistake tagged in the detail modal must reflect in the trades
// TABLE immediately (no tab-switch / remount). Root cause: the add/remove IPCs
// already return the full updated TradeListRow (preload:337/339), but the picker
// awaited and DISCARDED it — never notifying the list owner the way the sibling
// note/confidence/catalyst handlers do. The fix threads an optional
// onMistakesChange(updated) callback the picker fires with the returned row.
//
// This file proves the fix two ways:
//   1. END-TO-END through the REAL TradesTable -> TradeDetailModal -> picker chain
//      (the passthroughVirtualizer defeats jsdom's 0-height virtualizer, same as
//      TradesTable.bulk.test): adding a mistake updates the table CELL with no
//      remount.
//   2. Picker unit behaviour: add/remove pass the IPC-returned row up AND still
//      refetch the picker's own chips; a null (no-op) return skips the callback.

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { MistakeDef, MistakeTag } from '@shared/mistakes-types'
import { makeTrade } from '@/test/fixtures/trade'
import TradeMistakePicker from '../TradeMistakePicker'
import TradesTable from '../TradesTable'

// Backing object the ipc Proxy reads live — the mistakes methods get specific
// returns; every OTHER method the modal's children touch (playbooksList, etc.)
// falls through to a resolved [] (same shape as the lifecycle/bulk tests).
const { ipcMock } = vi.hoisted(() => ({ ipcMock: {} as Record<string, unknown> }))
vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy(ipcMock, {
    get: (target, prop: string) =>
      prop in target ? target[prop] : () => Promise.resolve([]),
  }),
}))
// Make every row "visible" under jsdom (real virtualizer renders 0 rows because
// clientHeight is 0). Shared passthrough — see src/test/mockVirtualizer.
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}

const DEF: MistakeDef = {
  id: 42,
  axis: 'psychological',
  name: 'FOMO entry',
  sort_position: 0,
  is_custom: false,
  is_archived: false,
}
const TAG: MistakeTag = { id: 42, axis: 'psychological', name: 'FOMO entry' }
const TRADE = makeTrade({ id: 1, symbol: 'AAA', mistakes: [] })
const UPDATED_ADD = makeTrade({
  id: 1,
  symbol: 'AAA',
  mistakes: ['FOMO entry'],
  mistakeTags: [{ name: 'FOMO entry', axis: 'psychological' }],
})
const UPDATED_REMOVE = makeTrade({ id: 1, symbol: 'AAA', mistakes: [] })

// Every required TradesTable handler as a no-op; the tests only exercise the
// mistakes path. No onBulkSoftDelete -> bulk selection UI stays off (simpler row
// click straight to the modal).
const TABLE_PROPS = {
  onSaveNote: noop,
  onSaveTimeframe: noop,
  onSavePlaybook: noop,
  onSaveConfidence: noop,
  onSavePlannedRisk: noop,
  onSavePlannedStopLoss: noop,
  onSaveFloat: noop,
  onSaveCatalyst: noop,
  onSaveCountry: noop,
}

beforeEach(() => {
  ipcMock.tradeMistakeTagsGet = vi.fn().mockResolvedValue([])
  ipcMock.mistakeDefsGet = vi.fn().mockResolvedValue([DEF])
  ipcMock.tradeMistakeTagAdd = vi.fn().mockResolvedValue(UPDATED_ADD)
  ipcMock.tradeMistakeTagRemove = vi.fn().mockResolvedValue(UPDATED_REMOVE)
})

describe('Symptom B — mistake tag reactivity', () => {
  it('END-TO-END: tagging a mistake in the modal updates the trades TABLE cell with no remount', async () => {
    // A tiny stateful host mirroring Trades.tsx's setTrades patch — proves the
    // real TradesTable -> TradeDetailModal -> TradeMistakePicker chain flows the
    // returned row all the way back to the table row.
    function Harness() {
      const [trades, setTrades] = useState<TradeListRow[]>([TRADE])
      const onMistakesChange = useCallback((updated: TradeListRow) => {
        setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      }, [])
      return (
        <TradesTable
          {...TABLE_PROPS}
          trades={trades}
          showMistakesColumn
          onMistakesChange={onMistakesChange}
        />
      )
    }

    render(<Harness />)
    const table = screen.getByRole('table')
    // Nothing tagged yet.
    expect(within(table).queryByText('FOMO entry')).toBeNull()

    // Open the row's detail modal, then add a mistake through the picker.
    fireEvent.click(within(table).getByText('AAA'))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Psychological mistake' }))
    fireEvent.click(await screen.findByRole('button', { name: 'FOMO entry' }))

    // The TABLE cell now reflects the new mistake — WITHOUT any tab-switch.
    expect(await within(table).findByText('FOMO entry')).toBeTruthy()
  })

  it('add: passes the IPC-returned row to onMistakesChange and still refetches its own chips', async () => {
    const onMistakesChange = vi.fn()
    render(<TradeMistakePicker trade={TRADE} onMistakesChange={onMistakesChange} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add Psychological mistake' }))
    fireEvent.click(await screen.findByRole('button', { name: 'FOMO entry' }))

    await waitFor(() => expect(onMistakesChange).toHaveBeenCalledWith(UPDATED_ADD))
    expect(ipcMock.tradeMistakeTagAdd).toHaveBeenCalledWith({ trade_id: 1, mistake_def_id: 42 })
    // Regression guard: the local refetch still runs (mount + after-add = 2).
    expect(ipcMock.tradeMistakeTagsGet).toHaveBeenCalledTimes(2)
  })

  it('remove: passes the IPC-returned row to onMistakesChange', async () => {
    ipcMock.tradeMistakeTagsGet = vi.fn().mockResolvedValue([TAG])
    const onMistakesChange = vi.fn()
    render(<TradeMistakePicker trade={TRADE} onMistakesChange={onMistakesChange} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove FOMO entry' }))

    await waitFor(() => expect(onMistakesChange).toHaveBeenCalledWith(UPDATED_REMOVE))
    expect(ipcMock.tradeMistakeTagRemove).toHaveBeenCalledWith({ trade_id: 1, mistake_def_id: 42 })
  })

  it('null IPC return (no-op): does NOT call onMistakesChange, but still refetches', async () => {
    ipcMock.tradeMistakeTagAdd = vi.fn().mockResolvedValue(null)
    const onMistakesChange = vi.fn()
    render(<TradeMistakePicker trade={TRADE} onMistakesChange={onMistakesChange} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add Psychological mistake' }))
    fireEvent.click(await screen.findByRole('button', { name: 'FOMO entry' }))

    await waitFor(() => expect(ipcMock.tradeMistakeTagsGet).toHaveBeenCalledTimes(2))
    expect(onMistakesChange).not.toHaveBeenCalled()
  })
})

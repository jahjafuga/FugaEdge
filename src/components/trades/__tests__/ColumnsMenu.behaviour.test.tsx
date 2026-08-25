// @vitest-environment jsdom
//
// v0.2.7 — CHARACTERIZATION NET, written BEFORE the chooser was generalised
// and run GREEN against the UNCHANGED component.
//
// MEASURED FIRST: five existing tests render ColumnsMenu
// (TradesTable.chrome.test.tsx:107, :118, :134, :144 and
// ViewRow.controls.test.tsx:37) and every one of them asserts the TRIGGER --
// its height, radius, border token, chevron and aria. Not one opens the menu.
// The item list, the checkbox wiring, the locked rule and the reset -- exactly
// the surface a generalisation moves -- had no guard at all.
//
// So these pin the BODY, at the behaviour level, before anything moves. If the
// refactor changes what the user sees or does, these go red; if it only
// changes where the code lives, they stay green. That is the whole job of a
// characterization net, and it is why they are written against the OLD
// component and committed alongside the new one.

import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ColumnsMenu from '@/components/trades/ColumnsMenu'
import {
  ALL_COLUMN_IDS,
  COLUMN_LABELS,
  DEFAULT_COLUMN_VISIBILITY,
  isLockedColumn,
  PINNED_COLUMNS,
  UNHIDEABLE_COLUMN,
} from '@/lib/prefs/columns'

afterEach(() => cleanup())

function open(visibility: Record<string, boolean> = {}, onChange = vi.fn()) {
  render(<ColumnsMenu visibility={visibility} onChange={onChange} />)
  fireEvent.click(screen.getByTestId('columns-button'))
  return onChange
}

describe('CM1 the menu lists EVERY column, once', () => {
  it('one toggle per id in ALL_COLUMN_IDS', () => {
    open()
    const missing = ALL_COLUMN_IDS.filter((id) => !screen.queryByTestId(`col-toggle-${id}`))
    expect(missing, `no toggle for: ${missing.join(', ')}`).toEqual([])
  })

  it('and no toggles beyond that list', () => {
    const { container } = render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    fireEvent.click(screen.getByTestId('columns-button'))
    const toggles = container.querySelectorAll('[data-testid^="col-toggle-"]')
    expect(toggles.length).toBe(ALL_COLUMN_IDS.length)
  })

  it('each row shows the column LABEL, not the raw id', () => {
    open()
    // 'symbol' -> 'Symbol'; a raw id would read lowercase.
    const row = screen.getByTestId('col-toggle-symbol')
    expect(row.textContent).toContain(COLUMN_LABELS.symbol)
  })
})

describe('CM2 the menu is closed until the trigger is pressed', () => {
  it('no menu body at rest', () => {
    render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    expect(screen.queryByTestId('columns-menu')).toBeNull()
  })

  it('the trigger opens it and reports its state', () => {
    render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    const btn = screen.getByTestId('columns-button')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(screen.getByTestId('columns-menu')).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('CM3 checked state reflects visibility, absent meaning visible', () => {
  it('an id absent from the map reads as CHECKED', () => {
    open({})
    const box = screen.getByTestId('col-toggle-net_pnl').querySelector('input')!
    expect((box as HTMLInputElement).checked, 'absent must mean visible').toBe(true)
  })

  it('an explicit false reads as UNCHECKED', () => {
    open({ net_pnl: false })
    const box = screen.getByTestId('col-toggle-net_pnl').querySelector('input')!
    expect((box as HTMLInputElement).checked).toBe(false)
  })
})

describe('CM4 toggling hands the WHOLE next map upward', () => {
  it('switching one off preserves the rest', () => {
    const onChange = open({ fees: false })
    fireEvent.click(screen.getByTestId('col-toggle-net_pnl').querySelector('input')!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0]![0] as Record<string, boolean>
    expect(next.net_pnl, 'the toggled id did not flip').toBe(false)
    expect(next.fees, 'an unrelated entry was dropped').toBe(false)
  })

  it('switching a hidden one back on sets true', () => {
    const onChange = open({ net_pnl: false })
    fireEvent.click(screen.getByTestId('col-toggle-net_pnl').querySelector('input')!)
    expect((onChange.mock.calls[0]![0] as Record<string, boolean>).net_pnl).toBe(true)
  })
})

describe('CM5 locked columns cannot be switched off', () => {
  const lockedIds = ALL_COLUMN_IDS.filter((id) => isLockedColumn(id))

  it('the locked set is the pinned pair plus the unhideable symbol', () => {
    // Pinned implies unhideable; asserted so the refactor cannot quietly
    // widen or narrow which ids are protected.
    for (const id of PINNED_COLUMNS) expect(lockedIds).toContain(id)
    expect(lockedIds).toContain(UNHIDEABLE_COLUMN)
  })

  it.each(lockedIds)('%s renders a DISABLED input', (id) => {
    open()
    const box = screen.getByTestId(`col-toggle-${id}`).querySelector('input')!
    expect((box as HTMLInputElement).disabled, `${id} can be switched off`).toBe(true)
  })

  it('an UNLOCKED column is not disabled', () => {
    open()
    const box = screen.getByTestId('col-toggle-net_pnl').querySelector('input')!
    expect((box as HTMLInputElement).disabled).toBe(false)
  })
})

describe('CM6 reset hands back the defaults', () => {
  it('the reset control exists inside the menu', () => {
    open()
    expect(screen.getByTestId('columns-reset')).toBeTruthy()
  })

  it('pressing it emits the DEFAULT visibility, not an empty map', () => {
    const onChange = open({ net_pnl: false, fees: false })
    fireEvent.click(screen.getByTestId('columns-reset'))
    const next = onChange.mock.calls[0]![0] as Record<string, boolean>
    // Every explicitly-hidden default must come back hidden, and the pinned
    // pair must come back visible -- resetColumnVisibility pins them.
    for (const [id, want] of Object.entries(DEFAULT_COLUMN_VISIBILITY)) {
      expect(next[id], `${id} did not reset`).toBe(want)
    }
    for (const id of PINNED_COLUMNS) expect(next[id]).toBe(true)
  })
})

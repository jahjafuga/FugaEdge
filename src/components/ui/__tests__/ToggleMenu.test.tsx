// @vitest-environment jsdom
//
// v0.2.7 — THE GENERIC CHOOSER. Written RED, before the component existed.
//
// WHY IT EXISTS: ColumnsMenu is a chooser with an item list, a checkbox per
// item, a locked rule and a reset -- and RANGES needs the identical thing over
// a different list. The alternative was a second copy, and a copied chooser is
// how the two drift until one of them forgets the locked rule.
//
// WHY NOT MultiSelectMenu: the existing ui/MultiSelectMenu takes options as
// string[] (the option is its own label) and selected as string[], where ABSENT
// means OFF. Columns are the exact inverse -- absent means VISIBLE, TanStack's
// rule (columns.ts:146) -- and it has no locked set and no reset. Making it
// serve both would invert the meaning of the array it persists.
//
// THE LOAD-BEARING CONSTRAINT: persistence stays OUT. This component never
// reads or writes a prefs key; it hands the next map upward and calls onReset.
// resetColumnVisibility() writes to localStorage (columns.ts:210), so that call
// belongs in the CALLER's onReset, not in here. Violating it would turn the
// later scope decision -- ranges per-account, columns global -- into a second
// refactor.
//
// AND IDENTITY IS THE CALLER'S TOO: testIds are a prop rather than derived,
// because six existing files address items as col-toggle-<id> and
// TradesTable.chrome.test.tsx:236 greps ColumnsMenu's OWN SOURCE for the
// literals 'columns-button' and 'columns-reset'. Deriving them would break nine
// files, and editing those guards to make this refactor pass is exactly what
// they exist to prevent.

import type { ComponentProps } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToggleMenu from '@/components/ui/ToggleMenu'

afterEach(() => cleanup())

const ITEMS = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
]

const IDS = {
  button: 'demo-button',
  menu: 'demo-menu',
  reset: 'demo-reset',
  item: (id: string) => 'demo-item-' + id,
}

type Props = ComponentProps<typeof ToggleMenu>

function mount(over: Partial<Props> = {}) {
  const onChange = vi.fn()
  const onReset = vi.fn()
  render(
    <ToggleMenu
      items={ITEMS}
      value={{}}
      onChange={onChange}
      onReset={onReset}
      label="Demo"
      testIds={IDS}
      {...over}
    />,
  )
  return { onChange, onReset }
}

function open(over: Partial<Props> = {}) {
  const h = mount(over)
  fireEvent.click(screen.getByTestId('demo-button'))
  return h
}

const boxOf = (id: string) =>
  screen.getByTestId('demo-item-' + id).querySelector('input') as HTMLInputElement

// --- T1 ---------------------------------------------------------------------

describe('T1 the caller supplies the list, and every item is rendered once', () => {
  it('one row per item', () => {
    open()
    for (const item of ITEMS) expect(screen.getByTestId('demo-item-' + item.id)).toBeTruthy()
  })

  it('and no rows beyond the list', () => {
    open()
    expect(document.querySelectorAll('[data-testid^="demo-item-"]').length).toBe(ITEMS.length)
  })

  it('each row shows the item LABEL, not its id', () => {
    open()
    const row = screen.getByTestId('demo-item-alpha')
    expect(row.textContent).toContain('Alpha')
    expect(row.textContent).not.toContain('alpha')
  })

  it('an EMPTY list still opens, and renders no rows', () => {
    // A generic chooser must not assume its caller has anything to show.
    mount({ items: [] })
    fireEvent.click(screen.getByTestId('demo-button'))
    expect(screen.getByTestId('demo-menu')).toBeTruthy()
    expect(document.querySelectorAll('[data-testid^="demo-item-"]').length).toBe(0)
  })
})

// --- T2 ---------------------------------------------------------------------

describe('T2 the trigger carries the caller label and reports its state', () => {
  it('closed at rest', () => {
    mount()
    expect(screen.queryByTestId('demo-menu')).toBeNull()
    expect(screen.getByTestId('demo-button').getAttribute('aria-expanded')).toBe('false')
  })

  it('the label is the caller word', () => {
    mount({ label: 'Ranges' })
    expect(screen.getByTestId('demo-button').textContent).toContain('Ranges')
  })

  it('opening reports expanded and announces a menu', () => {
    open()
    expect(screen.getByTestId('demo-button').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('demo-button').getAttribute('aria-haspopup')).toBe('menu')
  })

  it('and clicking the trigger again closes it', () => {
    open()
    fireEvent.click(screen.getByTestId('demo-button'))
    expect(screen.queryByTestId('demo-menu')).toBeNull()
  })
})

// --- T3 ---------------------------------------------------------------------

describe('T3 ABSENT means ON -- the rule the caller persists', () => {
  it('an id absent from value reads CHECKED', () => {
    open()
    expect(boxOf('alpha').checked).toBe(true)
  })

  it('an explicit false reads UNCHECKED', () => {
    open({ value: { alpha: false } })
    expect(boxOf('alpha').checked).toBe(false)
  })

  it('an explicit true reads CHECKED', () => {
    open({ value: { alpha: true } })
    expect(boxOf('alpha').checked).toBe(true)
  })
})

// --- T4 ---------------------------------------------------------------------

describe('T4 toggling hands the WHOLE next map upward and touches nothing else', () => {
  it('flips the one that was clicked', () => {
    const { onChange } = open()
    fireEvent.click(boxOf('alpha'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].alpha).toBe(false)
  })

  it('preserves unrelated entries', () => {
    const { onChange } = open({ value: { beta: false } })
    fireEvent.click(boxOf('alpha'))
    expect(onChange.mock.calls[0]![0].beta, 'an unrelated entry was dropped').toBe(false)
  })

  it('switches a false one back on', () => {
    const { onChange } = open({ value: { alpha: false } })
    fireEvent.click(boxOf('alpha'))
    expect(onChange.mock.calls[0]![0].alpha).toBe(true)
  })

  it('does NOT persist anything itself -- the caller owns the key', () => {
    const wrote: string[] = []
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k) => {
      wrote.push(String(k))
    })
    const { onChange } = open()
    fireEvent.click(boxOf('alpha'))
    spy.mockRestore()
    expect(onChange, 'the toggle never reached the caller').toHaveBeenCalledTimes(1)
    expect(wrote, 'the generic wrote to storage: ' + wrote.join(', ')).toEqual([])
  })
})

// --- T5 ---------------------------------------------------------------------

describe('T5 locked ids cannot be switched off', () => {
  const LOCKED = new Set(['alpha'])

  it('a locked row is DISABLED', () => {
    open({ locked: LOCKED })
    expect(boxOf('alpha').disabled).toBe(true)
  })

  it('an unlocked row is not', () => {
    open({ locked: LOCKED })
    expect(boxOf('beta').disabled).toBe(false)
  })

  it('clicking a locked row emits NOTHING', () => {
    // Not merely disabled-looking: a disabled input must also be inert.
    const { onChange } = open({ locked: LOCKED })
    fireEvent.click(boxOf('alpha'))
    expect(onChange, 'a locked item was switched off').not.toHaveBeenCalled()
  })

  it('locked is OPTIONAL -- omitting it locks nothing', () => {
    open()
    for (const item of ITEMS) expect(boxOf(item.id).disabled).toBe(false)
  })
})

// --- T6 ---------------------------------------------------------------------

describe('T6 reset is the caller decision, delegated', () => {
  it('the control exists inside the menu', () => {
    open()
    expect(screen.getByTestId('demo-reset')).toBeTruthy()
  })

  it('pressing it calls onReset', () => {
    const { onReset } = open()
    fireEvent.click(screen.getByTestId('demo-reset'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('and the generic does NOT invent a next map of its own', () => {
    // If this component decided what "default" meant, two callers with
    // different defaults would need two components again.
    const { onChange, onReset } = open()
    fireEvent.click(screen.getByTestId('demo-reset'))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onChange, 'the chooser guessed at the defaults').not.toHaveBeenCalled()
  })
})

// --- T7 ---------------------------------------------------------------------

describe('T7 identity belongs to the caller', () => {
  it('all four testids come from the prop, none are hardcoded', () => {
    mount({
      testIds: {
        button: 'other-button',
        menu: 'other-menu',
        reset: 'other-reset',
        item: (id: string) => 'other-' + id,
      },
    })
    fireEvent.click(screen.getByTestId('other-button'))
    expect(screen.getByTestId('other-menu')).toBeTruthy()
    expect(screen.getByTestId('other-alpha')).toBeTruthy()
    expect(screen.getByTestId('other-reset')).toBeTruthy()
    expect(screen.queryByTestId('demo-button'), 'a testid was hardcoded').toBeNull()
  })
})

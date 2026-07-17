// @vitest-environment jsdom
//
// THE FINAL TWO, build A — the Remove guard. The editor's Remove was an
// unguarded hard delete (its own header admitted "it can re-orphan a
// referenced rule"). Now: a rule whose id is marked on >= 1 day cannot be
// removed — the button disables and the RuleList frozen-row idiom shows
// "used on N day(s) — archive instead"; unused rules remove freely; the
// guard applies to archived-but-used rules too. Rename + archive untouched.

import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { JournalRule } from '@shared/journal-types'
import JournalRuleEditor from '../JournalRuleEditor'

const RULES: JournalRule[] = [
  { id: 'r1', name: 'Honor the stop', archived: false },
  { id: 'r2', name: 'No FOMO entries', archived: false },
  { id: 'r3', name: 'Old retired rule', archived: true },
]

const USAGE = { r1: 3, r3: 1 }

const onChange = vi.fn()

function renderEditor() {
  render(<JournalRuleEditor rules={RULES} onChange={onChange} usageById={USAGE} />)
}

const rowOf = (name: string) =>
  screen.getByDisplayValue(name).closest('li') as HTMLElement

afterEach(() => {
  vi.clearAllMocks()
})

describe('JournalRuleEditor — the Remove guard (the final two, build A)', () => {
  it('(1) a used rule cannot be removed: button disabled, copy carries the day count', () => {
    renderEditor()
    const row = rowOf('Honor the stop')
    const btn = within(row).getByRole('button', { name: /remove|cannot remove/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(within(row).getByText('used on 3 days — archive instead')).toBeTruthy()
  })

  it('(2) an unused rule still removes freely', () => {
    renderEditor()
    const row = rowOf('No FOMO entries')
    const btn = within(row).getByRole('button', { name: 'Remove rule' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith([RULES[0], RULES[2]])
  })

  it('(3) an archived-but-used rule is still blocked (singular copy)', () => {
    renderEditor()
    const row = rowOf('Old retired rule')
    const btn = within(row).getByRole('button', { name: /remove|cannot remove/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(within(row).getByText('used on 1 day — archive instead')).toBeTruthy()
  })

  it('(5) rename and archive stay untouched on a USED rule', () => {
    renderEditor()
    fireEvent.change(screen.getByDisplayValue('Honor the stop'), {
      target: { value: 'Honor the stop always' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { id: 'r1', name: 'Honor the stop always', archived: false },
      RULES[1],
      RULES[2],
    ])
    onChange.mockClear()
    fireEvent.click(within(rowOf('Honor the stop')).getByLabelText('Archive rule'))
    expect(onChange).toHaveBeenCalledWith([
      { id: 'r1', name: 'Honor the stop', archived: true },
      RULES[1],
      RULES[2],
    ])
  })

  it('usage prop absent -> rows behave exactly as before the guard (loading honesty)', () => {
    render(<JournalRuleEditor rules={RULES} onChange={onChange} />)
    const btn = within(rowOf('Honor the stop')).getByRole('button', { name: 'Remove rule' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
})

// Beat 2 "stop the bleeding" — the FROZEN-ROW guard on the rule-breaks editor.
//
// Rule-breaks have no id and no archived flag: days link to them by NAME
// (journal.rule_breaks) and Analytics groups by the raw string, so deleting OR renaming a
// used label silently orphans day history. Until Beat 3 ships a history-preserving rename,
// a label used on >= 1 day is FROZEN: the name input is read-only (which kills the
// per-keystroke rename vector at its source) and the delete button is disabled.
//
// Unused labels (day-count 0, or absent from the map) stay fully editable and deletable --
// nothing changes for them.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RuleList from '../RuleList'

const RULES = ['Overtrading', 'Revenge trade']

// "Overtrading" is used on 12 days; "Revenge trade" is unused (absent from the map).
const USAGE = { Overtrading: 12 }

const inputFor = (label: string) => screen.getByDisplayValue(label) as HTMLInputElement
const removeBtnFor = (label: string) =>
  inputFor(label).closest('li')!.querySelector('button') as HTMLButtonElement

describe('RuleList — a USED rule-break is frozen', () => {
  it('the name input is READ-ONLY (the rename vector is closed at the source)', () => {
    render(<RuleList rules={RULES} onChange={vi.fn()} usageByLabel={USAGE} />)
    expect(inputFor('Overtrading').readOnly).toBe(true)
  })

  it('the delete button is DISABLED', () => {
    render(<RuleList rules={RULES} onChange={vi.fn()} usageByLabel={USAGE} />)
    expect(removeBtnFor('Overtrading').disabled).toBe(true)
  })

  it('the row states WHY, with the day count', () => {
    render(<RuleList rules={RULES} onChange={vi.fn()} usageByLabel={USAGE} />)
    expect(screen.getByText(/used on 12 days/i)).toBeTruthy()
  })

  it('typing into a frozen input cannot change the list', () => {
    const onChange = vi.fn()
    render(<RuleList rules={RULES} onChange={onChange} usageByLabel={USAGE} />)
    fireEvent.change(inputFor('Overtrading'), { target: { value: 'Over-trading' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clicking the disabled delete cannot remove it', () => {
    const onChange = vi.fn()
    render(<RuleList rules={RULES} onChange={onChange} usageByLabel={USAGE} />)
    fireEvent.click(removeBtnFor('Overtrading'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a whitespace-drifted vocabulary entry still matches its usage (trim both sides)', () => {
    render(<RuleList rules={['Overtrading ']} onChange={vi.fn()} usageByLabel={USAGE} />)
    // RTL's default matcher normalizes whitespace, so query with the trimmed form...
    const input = screen.getByDisplayValue('Overtrading') as HTMLInputElement
    // ...but the DOM value really does carry the drift...
    expect(input.value).toBe('Overtrading ')
    // ...and it must STILL be frozen. If drift freed the row, the user could delete it and
    // orphan the very days the guard exists to protect.
    expect(input.readOnly).toBe(true)
  })
})

describe('RuleList — an UNUSED rule-break is untouched', () => {
  it('stays editable and renaming still flows to onChange', () => {
    const onChange = vi.fn()
    render(<RuleList rules={RULES} onChange={onChange} usageByLabel={USAGE} />)

    const input = inputFor('Revenge trade')
    expect(input.readOnly).toBe(false)
    fireEvent.change(input, { target: { value: 'Revenge' } })
    expect(onChange).toHaveBeenCalledWith(['Overtrading', 'Revenge'])
  })

  it('stays deletable and removing still flows to onChange', () => {
    const onChange = vi.fn()
    render(<RuleList rules={RULES} onChange={onChange} usageByLabel={USAGE} />)

    expect(removeBtnFor('Revenge trade').disabled).toBe(false)
    fireEvent.click(removeBtnFor('Revenge trade'))
    expect(onChange).toHaveBeenCalledWith(['Overtrading'])
  })

  it('carries no "used on" note', () => {
    render(<RuleList rules={['Revenge trade']} onChange={vi.fn()} usageByLabel={{}} />)
    expect(screen.queryByText(/used on/i)).toBeNull()
  })

  it('with NO usage map at all (still loading), every row behaves exactly as today', () => {
    const onChange = vi.fn()
    render(<RuleList rules={RULES} onChange={onChange} />)
    expect(inputFor('Overtrading').readOnly).toBe(false)
    expect(removeBtnFor('Overtrading').disabled).toBe(false)
  })
})

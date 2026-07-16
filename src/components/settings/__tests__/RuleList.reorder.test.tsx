import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RuleList from '../RuleList'

// Dave #12 — reorder for the Daily Rule Breaks vocabulary, the VocabularyEditor
// chevron pattern ported into the savebar-draft world: adjacent swap in the
// draft array, end-guards, aria-labels per the precedent. REORDER ONLY —
// rename/archive stay parked as 3b-2, and the Beat-2 freeze is identity-keyed
// (usageByLabel[label]), so frozen rows MOVE with their frozen treatment
// intact and their arrows stay live.

/** Stateful wrapper so arrow clicks round-trip like the Settings draft does. */
function Host({ initial, usage }: { initial: string[]; usage?: Record<string, number> }) {
  const [rules, setRules] = useState(initial)
  return (
    <>
      <RuleList rules={rules} onChange={setRules} usageByLabel={usage} />
      <output data-testid="order">{rules.join('|')}</output>
    </>
  )
}

const order = () => screen.getByTestId('order').textContent

describe('(1) arrows — adjacent swap, end-guards, precedent aria, frozen rows movable', () => {
  it('renders Move up/down per row; top-up and bottom-down disabled; clicks swap adjacents', () => {
    render(<Host initial={['Alpha', 'Bravo', 'Charlie', 'Delta']} />)

    expect((screen.getByLabelText('Move Alpha up') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move Alpha down') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Move Delta down') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move Delta up') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByLabelText('Move Bravo up'))
    expect(order()).toBe('Bravo|Alpha|Charlie|Delta')
    fireEvent.click(screen.getByLabelText('Move Charlie down'))
    expect(order()).toBe('Bravo|Alpha|Delta|Charlie')

    // End-guards re-evaluate after moves: Bravo is now the top row.
    expect((screen.getByLabelText('Move Bravo up') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move Charlie down') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a FROZEN row reorders with its frozen treatment intact (live arrows, read-only name, disabled delete, day-count)', () => {
    render(
      <Host
        initial={['Alpha', 'Bravo', 'Charlie']}
        usage={{ Bravo: 3 }}
      />,
    )

    // Frozen before the move: read-only input, disabled delete, day-count.
    const bravoInput = screen.getByDisplayValue('Bravo') as HTMLInputElement
    expect(bravoInput.readOnly).toBe(true)
    expect(
      (screen.getByLabelText('Cannot remove Bravo — used on 3 days') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText('used on 3 days')).toBeTruthy()

    // The arrows are LIVE on the frozen row — position is not identity.
    const up = screen.getByLabelText('Move Bravo up') as HTMLButtonElement
    expect(up.disabled).toBe(false)
    fireEvent.click(up)
    expect(order()).toBe('Bravo|Alpha|Charlie')

    // Frozen treatment traveled with the row.
    const movedInput = screen.getByDisplayValue('Bravo') as HTMLInputElement
    expect(movedInput.readOnly).toBe(true)
    expect(
      (screen.getByLabelText('Cannot remove Bravo — used on 3 days') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText('used on 3 days')).toBeTruthy()
    // ...and the unfrozen rows stayed unfrozen.
    expect((screen.getByDisplayValue('Alpha') as HTMLInputElement).readOnly).toBe(false)
  })

  it('(7) usage counts and frozen status are untouched by any reorder', () => {
    render(<Host initial={['Alpha', 'Bravo', 'Charlie']} usage={{ Bravo: 3, Charlie: 1 }} />)
    fireEvent.click(screen.getByLabelText('Move Charlie up'))
    fireEvent.click(screen.getByLabelText('Move Charlie up'))
    expect(order()).toBe('Charlie|Alpha|Bravo')
    expect(screen.getByText('used on 1 day')).toBeTruthy()
    expect(screen.getByText('used on 3 days')).toBeTruthy()
    expect((screen.getByDisplayValue('Charlie') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByDisplayValue('Bravo') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByDisplayValue('Alpha') as HTMLInputElement).readOnly).toBe(false)
  })
})

describe('(2) stable row keys — a moved row keeps its DOM node (the key={i} hazard)', () => {
  it("the input node that held 'Bravo' still holds 'Bravo' after Bravo moves up", () => {
    render(<Host initial={['Alpha', 'Bravo', 'Charlie']} />)
    const bravoNode = screen.getByDisplayValue('Bravo')
    // fireEvent does not steal focus — focus the input like a mid-edit user.
    ;(bravoNode as HTMLInputElement).focus()
    fireEvent.click(screen.getByLabelText('Move Bravo up'))

    // With index keys React would swap VALUES between fixed nodes: the focused
    // node would suddenly read 'Alpha'. With stable ids the NODE moves.
    expect(screen.getByDisplayValue('Bravo')).toBe(bravoNode)
    expect((document.activeElement as HTMLInputElement).value).toBe('Bravo')
  })
})

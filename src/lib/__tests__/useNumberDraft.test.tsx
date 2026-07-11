// The number-input draft hook — the "050" append fix.
//
// WHY A STRING DRAFT: React's DOM sync for <input type="number"> compares node.value
// against the value prop with a LOOSE != (react-dom updateWrapper). A NUMBER prop of 50
// therefore tests EQUAL to a DOM string of "050" (the string coerces), so React never
// repaints and the leading zero sticks. The same branch force-writes "0" back whenever
// the prop is the number 0 and the node is empty, which is why the "0" was un-deletable.
//
// Binding a STRING defeats both halves WITHOUT touching type="number":
//   - string vs string needs no coercion, so `!=` behaves like `!==` and React repaints
//   - `'' === 0` is false, so an emptied field is no longer overwritten with "0"
//
// These tests drive the hook through a host that mirrors the real wiring (draft -> parent
// state -> value prop back down), because the sync-guard bug only appears in that loop.

import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useNumberDraft } from '@/lib/useNumberDraft'

// Mirrors how Settings' NumberField / PillarNumber / DailyTargetSection wire the hook:
// the committed number flows up to parent state, which flows back down as `value`.
function Host({ initial, scale }: { initial: number; scale?: number }) {
  const [value, setValue] = useState(initial)
  const { draft, onDraftChange } = useNumberDraft(value, scale)
  return (
    <div>
      <input
        aria-label="field"
        type="number"
        placeholder="0"
        value={draft}
        onChange={(e) => setValue(onDraftChange(e.target.value))}
      />
      <span data-testid="stored">{String(value)}</span>
      <button type="button" onClick={() => setValue(999)}>
        external-set-999
      </button>
    </div>
  )
}

const field = () => screen.getByLabelText('field') as HTMLInputElement
const stored = () => screen.getByTestId('stored').textContent

describe('useNumberDraft — display', () => {
  it('renders 0 as an EMPTY draft (so a "0" placeholder shows and there is nothing to append to)', () => {
    render(<Host initial={0} />)
    expect(field().value).toBe('')
    expect(field().placeholder).toBe('0')
  })

  it('renders a non-zero value as its string', () => {
    render(<Host initial={500} />)
    expect(field().value).toBe('500')
  })

  it('keeps type="number" (the spinbutton role other tests rely on)', () => {
    render(<Host initial={0} />)
    expect(field().type).toBe('number')
    expect(screen.getByRole('spinbutton')).toBeTruthy()
  })
})

describe('useNumberDraft — the append fix', () => {
  it('typing 5 then 0 into a zero field shows "50", NEVER "050", and commits 50', () => {
    render(<Host initial={0} />)
    // The field starts EMPTY, so the browser sends "5" then "50" — there is no stray
    // "0" to prepend. This is the whole bug: today the box holds a literal "0".
    fireEvent.change(field(), { target: { value: '5' } })
    expect(field().value).toBe('5')
    expect(stored()).toBe('5')

    fireEvent.change(field(), { target: { value: '50' } })
    expect(field().value).toBe('50')
    expect(stored()).toBe('50')
  })

  it('the draft tracks the input VERBATIM (React repaints; the DOM never drifts from state)', () => {
    render(<Host initial={0} />)
    // Even if a leading zero is deliberately typed, the DOM and the draft agree — the
    // old bug was React REFUSING to repaint, leaving the node out of sync with state.
    fireEvent.change(field(), { target: { value: '050' } })
    expect(field().value).toBe('050')
    expect(stored()).toBe('50') // parsed value is still correct
  })
})

describe('useNumberDraft — the "0" is deletable', () => {
  it('clearing reaches EMPTY (React no longer forces "0" back) and commits 0', () => {
    render(<Host initial={500} />)
    expect(field().value).toBe('500')

    fireEvent.change(field(), { target: { value: '' } })
    expect(field().value).toBe('') // today React repaints "0" here
    expect(stored()).toBe('0') // empty still MEANS 0 — semantics unchanged
  })

  it('an empty draft is not clobbered back to "0" by the incoming 0 it just produced', () => {
    render(<Host initial={500} />)
    fireEvent.change(field(), { target: { value: '' } })
    // value is now 0; the sync effect must recognise that the empty draft ALREADY
    // represents 0 and leave it alone, or the field would flicker back to "0".
    expect(field().value).toBe('')
    expect(stored()).toBe('0')
  })
})

describe('useNumberDraft — external sync', () => {
  it('an EXTERNAL value change (settings load / reset) refreshes the draft', () => {
    render(<Host initial={0} />)
    expect(field().value).toBe('')
    fireEvent.click(screen.getByText('external-set-999'))
    expect(field().value).toBe('999')
  })

  it('does not clobber the draft with a re-stringified value (the number it JUST committed is not an external change)', () => {
    render(<Host initial={0} />)
    // "05" commits 5, so `value` changes 0 -> 5 and the sync effect RUNS. It must see that
    // the current draft already commits to 5 and leave it verbatim. A guard that compared
    // STRINGS would rewrite the box to "5" and yank the caret out from under the user.
    fireEvent.change(field(), { target: { value: '05' } })
    expect(field().value).toBe('05')
    expect(stored()).toBe('5')
  })

  it('a decimal survives the sync guard', () => {
    render(<Host initial={0} />)
    fireEvent.change(field(), { target: { value: '2.5' } })
    expect(field().value).toBe('2.5')
    expect(stored()).toBe('2.5')
  })

  // NOT ASSERTABLE HERE, and not a jsdom quirk: per the HTML spec "1." is not a valid
  // floating-point number, so <input type="number">.value sanitizes a half-typed decimal to
  // "" in every browser. The string draft still improves this case in a REAL browser —
  // today the numeric prop makes React force-write "0" over the raw "1." the moment the dot
  // is typed (the `value === 0 && node.value === ''` branch), destroying it; with a string
  // draft React writes nothing, so the raw text survives until "1.5" is valid again. That is
  // a visual behaviour with no DOM value to assert, so it belongs to the eyes-gate.
})

describe('useNumberDraft — scale divisor (the DNA float pillars)', () => {
  it('stored -> displayed: divides by scale', () => {
    render(<Host initial={20_000_000} scale={1_000_000} />)
    expect(field().value).toBe('20')
  })

  it('displayed -> stored: multiplies by scale', () => {
    render(<Host initial={0} scale={1_000_000} />)
    expect(field().value).toBe('')
    fireEvent.change(field(), { target: { value: '12' } })
    expect(field().value).toBe('12')
    expect(stored()).toBe('12000000')
  })

  it('a scaled DECIMAL round-trips without the sync guard eating the draft', () => {
    // 12.345678 * 1e6 is not exact in IEEE754. If the guard compared in DISPLAY space it
    // would see 12.345678 !== 12.345678000000002 and clobber the draft with float noise
    // mid-keystroke. Comparing in STORED space (re-running the same commit expression)
    // makes the round-trip bit-identical.
    render(<Host initial={0} scale={1_000_000} />)
    fireEvent.change(field(), { target: { value: '12.345678' } })
    expect(field().value).toBe('12.345678')
    expect(Number(stored())).toBeCloseTo(12_345_678, 6)
  })
})

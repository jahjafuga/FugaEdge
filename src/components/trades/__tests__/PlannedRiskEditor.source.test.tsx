// v0.2.7 Feature 3 Commit 3 — T19. A derived stop and a typed one produce
// identical R numbers, so the only thing that can tell them apart on screen is a
// label. Without it the app quietly presents its own guess as the user's plan.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlannedRiskEditor from '../PlannedRiskEditor'

function renderEditor(over: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  const { unmount } = render(
    <PlannedRiskEditor
      plannedStopLossPrice={7.2375}
      stopSource="auto"
      entryPrice={7.5}
      shares={100}
      riskPerShare={0.2625}
      totalRisk={26.25}
      netPnL={50}
      rMultiple={1.9}
      isClosed
      onChange={onChange}
      {...over}
    />,
  )
  return { onChange, unmount }
}

describe('T19 the trade detail distinguishes a typed stop from a derived one', () => {
  it('a derived stop is labelled as derived', () => {
    renderEditor()
    expect(screen.getByTestId('stop-source').textContent).toMatch(/derived/i)
  })

  it('a typed stop is labelled as the user`s own', () => {
    renderEditor({ stopSource: 'manual' })
    const badge = screen.getByTestId('stop-source')
    expect(badge.textContent).toMatch(/you set this/i)
    expect(badge.textContent).not.toMatch(/derived/i)
  })

  it('no stop means no claim about where it came from', () => {
    renderEditor({ plannedStopLossPrice: null, stopSource: null })
    expect(screen.queryByTestId('stop-source')).toBeNull()
  })

  it('the two labels are actually different strings', () => {
    // A badge that renders the same text either way would satisfy every assertion
    // above while telling the user nothing.
    const first = renderEditor()
    const derived = screen.getByTestId('stop-source').textContent
    first.unmount()
    renderEditor({ stopSource: 'manual' })
    const manual = screen.getByTestId('stop-source').textContent
    expect(derived).not.toBe(manual)
  })

  it('editing still commits the typed value on blur', () => {
    const { onChange } = renderEditor()
    // The field shows the house price precision now: 7.2375 is stored, 7.24 is
    // shown. The stored value keeps its full precision — this is the display.
    const input = screen.getByDisplayValue('7.24')
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(7)
  })
})

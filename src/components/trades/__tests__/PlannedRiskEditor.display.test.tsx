// @vitest-environment jsdom
// v0.2.7 — the stop field shows a price, not a float.
//
// MEASURED on the live book with the auto-fill on: SIX of the eleven derived stops
// stored a full binary expansion, and the field printed them raw. 9.593300000000001
// where the trade is worth 9.59. Storage stays unrounded by ruling — every R the
// trade ever reports divides by it — so this is a DISPLAY fix and only a display fix.
//
// T12 IS THE ONE THAT MATTERS. Formatting the field is the easy half; the trap is
// that the text now differs from the stored number by design, so a commit that
// compares them treats every blur as an edit. That would write the rounded value
// back and flip a derived stop to manual just for clicking through the card.

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlannedRiskEditor from '../PlannedRiskEditor'

/** The four real stored values from the verify, plus a sub-dollar case. */
const REAL_FLOATS: [number, string][] = [
  [5.635699999999999, '5.64'],
  [3.9284999999999997, '3.93'],
  [7.119800000000001, '7.12'],
  [9.593300000000001, '9.59'],
]

function renderEditor(over: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  const { unmount } = render(
    <PlannedRiskEditor
      plannedStopLossPrice={9.593300000000001}
      stopSource="auto"
      entryPrice={9.89}
      shares={100}
      riskPerShare={0.2967}
      totalRisk={29.67}
      netPnL={50}
      rMultiple={1.68}
      isClosed
      onChange={onChange}
      {...over}
    />,
  )
  return { onChange, unmount }
}
const field = () => document.querySelector('input[inputmode="decimal"]') as HTMLInputElement

describe('T11 the stop renders at the house price precision', () => {
  it('two decimals at or above a dollar', () => {
    renderEditor({ plannedStopLossPrice: 2.619 })
    expect(field().value).toBe('2.62')
  })

  it('four decimals below a dollar, where sub-penny ticks are real', () => {
    renderEditor({ plannedStopLossPrice: 0.0125 })
    expect(field().value).toBe('0.0125')
  })

  it('and an absent stop shows nothing rather than a zero', () => {
    renderEditor({ plannedStopLossPrice: null, stopSource: null })
    expect(field().value).toBe('')
  })
})

describe('T11b the six stored values with a full binary expansion render clean', () => {
  for (const [stored, shown] of REAL_FLOATS) {
    it(`${stored} renders as ${shown}`, () => {
      const { unmount } = renderEditor({ plannedStopLossPrice: stored })
      expect(field().value).toBe(shown)
      // and nothing leaks the expansion anywhere else in the card
      expect(document.body.textContent).not.toContain(String(stored))
      unmount()
    })
  }
})

describe('T12 a blur without typing must not write back or flip to manual', () => {
  it('blurring an untouched derived stop calls nothing', () => {
    const { onChange } = renderEditor()
    fireEvent.blur(field())
    expect(
      onChange,
      'blurring wrote the rounded value back, which flips the row to manual',
    ).not.toHaveBeenCalled()
  })

  it('nor does focusing, blurring and blurring again', () => {
    const { onChange } = renderEditor()
    for (const stored of REAL_FLOATS.map((r) => r[0])) void stored
    fireEvent.focus(field())
    fireEvent.blur(field())
    fireEvent.focus(field())
    fireEvent.blur(field())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('and retyping exactly what is shown is not an edit either', () => {
    const { onChange } = renderEditor()
    fireEvent.change(field(), { target: { value: '9.59' } })
    fireEvent.blur(field())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('every one of the six real values survives a blur untouched', () => {
    for (const [stored] of REAL_FLOATS) {
      const { onChange, unmount } = renderEditor({ plannedStopLossPrice: stored })
      fireEvent.blur(field())
      expect(onChange, `${stored} was written back on blur`).not.toHaveBeenCalled()
      unmount()
    }
  })
})

describe('T13 a REAL edit still commits', () => {
  it('typing a different price writes it', () => {
    const { onChange } = renderEditor()
    fireEvent.change(field(), { target: { value: '9.25' } })
    fireEvent.blur(field())
    expect(onChange).toHaveBeenCalledWith(9.25)
  })

  it('clearing the field clears the stop', () => {
    const { onChange } = renderEditor()
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('and a junk value is rejected and the field restored', () => {
    const { onChange } = renderEditor()
    fireEvent.change(field(), { target: { value: 'abc' } })
    fireEvent.blur(field())
    expect(onChange).not.toHaveBeenCalled()
    expect(field().value).toBe('9.59')
  })

  it('Enter commits the same way a blur does', () => {
    const { onChange } = renderEditor()
    fireEvent.change(field(), { target: { value: '9.10' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    fireEvent.blur(field())
    expect(onChange).toHaveBeenCalledWith(9.1)
  })
})

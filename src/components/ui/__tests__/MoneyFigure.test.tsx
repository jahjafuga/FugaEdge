// @vitest-environment jsdom
//
// Beat 3.5 round 2 — MoneyFigure: the split-cents display figure. THE
// TEXTCONTENT LAW (pin-safety #1): the element's textContent must equal
// money(value) BYTE-FOR-BYTE — dollars and cents render as adjacent spans
// with no whitespace nodes — so every existing '$1,037.82'-class pin in
// the app survives the split styling.

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MoneyFigure from '../MoneyFigure'
import { money } from '@/lib/format'

function textOf(value: number): string {
  const { container, unmount } = render(<MoneyFigure value={value} />)
  const text = container.textContent ?? ''
  unmount()
  return text
}

describe('MoneyFigure — the textContent law', () => {
  it('textContent equals money(value) byte-for-byte', () => {
    expect(textOf(1037.82)).toBe(money(1037.82))
    expect(textOf(0)).toBe(money(0))
  })

  it('holds for negatives and >$1k values (the Intl comma + sign shapes)', () => {
    expect(textOf(-112.18)).toBe(money(-112.18))
    expect(textOf(6337.82)).toBe(money(6337.82))
    expect(textOf(-25000)).toBe(money(-25000))
  })

  it('renders the cents as their own span (the split exists)', () => {
    const { container } = render(<MoneyFigure value={1037.82} />)
    const cents = container.querySelector('[data-testid="money-cents"]')
    expect(cents).toBeTruthy()
    expect(cents!.textContent).toBe('.82')
  })
})

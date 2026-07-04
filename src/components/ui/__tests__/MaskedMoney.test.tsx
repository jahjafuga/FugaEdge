// @vitest-environment jsdom
//
// Beat 4 build A1 — the mask primitive. The MASKING is pure CSS keyed on
// html.streamer; components only carry the marker class. Two laws pinned:
// (1) the wrapper NEVER changes textContent (the pin-safety law — every
// '$1,037.82'-class assertion in the suite survives); (2) MoneyFigure
// carries the marker CENTRALLY, so its ~7 call sites adopt in one edit.

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MaskedMoney from '../MaskedMoney'
import MoneyFigure from '../MoneyFigure'
import { money } from '@/lib/format'

describe('MaskedMoney — the marker wrapper', () => {
  it('renders children with textContent unchanged and carries the masked-money class', () => {
    const { container } = render(<MaskedMoney>{money(1037.82)}</MaskedMoney>)
    expect(container.textContent).toBe('$1,037.82')
    const el = container.querySelector('.masked-money')
    expect(el).toBeTruthy()
    expect(el!.textContent).toBe('$1,037.82')
  })

  it('merges an extra className without disturbing the marker', () => {
    const { container } = render(
      <MaskedMoney className="text-win">{money(5)}</MaskedMoney>,
    )
    const el = container.querySelector('.masked-money')!
    expect(el.className).toContain('text-win')
  })
})

describe('MoneyFigure — central adoption', () => {
  it('the split figure carries the masked-money marker and keeps its textContent law', () => {
    const { container } = render(<MoneyFigure value={6337.82} />)
    const el = container.querySelector('.masked-money')
    expect(el).toBeTruthy()
    expect(container.textContent).toBe(money(6337.82))
  })
})

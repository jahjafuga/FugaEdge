import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DivergingBar from '../DivergingBar'

// RED-first unit tests for the DivergingBar primitive (F5 phase 1 of 2), written
// before the implementation; the contract is the geometry in the component's
// header comment. SENTINEL hex colors (#FF0000 / #00FF00 — never chartColors)
// prove the primitive is color-agnostic: it fills with exactly the strings it is
// handed. SVG geometry is read via container.querySelector + getAttribute (rects
// carry no role/text), the same container idiom as the MacdStateGrid suite. No
// fireEvent / no fake timers — the bar is a pure visual with no interaction.
//
// Fixture frame: width=100 → centerline cx=50, each side's max length half=50;
// extent=10, so |value| >= 10 caps the bar at the half-width edge.

const LEFT = '#FF0000'
const RIGHT = '#00FF00'

const base = {
  value: 0,
  extent: 10,
  leftColor: LEFT,
  rightColor: RIGHT,
  width: 100,
  height: 12,
}

describe('DivergingBar — centered diverging-bar primitive', () => {
  it('positive value grows a right-side bar from the centerline in rightColor', () => {
    const { container } = render(<DivergingBar {...base} value={5} />)
    const rect = container.querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('50') // starts at the centerline
    expect(rect?.getAttribute('width')).toBe('25') // (5/10) * 50
    expect(rect?.getAttribute('fill')).toBe(RIGHT)
  })

  it('negative value grows a left-side bar toward the centerline in leftColor', () => {
    const { container } = render(<DivergingBar {...base} value={-5} />)
    const rect = container.querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('25') // cx - len = 50 - 25
    expect(rect?.getAttribute('width')).toBe('25')
    expect(rect?.getAttribute('fill')).toBe(LEFT)
  })

  it('clamps to the half-width edge at and beyond extent, both directions', () => {
    // value === extent: full right half.
    const atExtent = render(<DivergingBar {...base} value={10} />)
    expect(atExtent.container.querySelector('rect')?.getAttribute('x')).toBe('50')
    expect(atExtent.container.querySelector('rect')?.getAttribute('width')).toBe('50')
    atExtent.unmount()

    // value > extent: identical (clamped, not overflowing).
    const beyond = render(<DivergingBar {...base} value={25} />)
    expect(beyond.container.querySelector('rect')?.getAttribute('x')).toBe('50')
    expect(beyond.container.querySelector('rect')?.getAttribute('width')).toBe('50')
    beyond.unmount()

    // value < -extent: full left half, anchored at x=0.
    const beyondNeg = render(<DivergingBar {...base} value={-25} />)
    expect(beyondNeg.container.querySelector('rect')?.getAttribute('x')).toBe('0')
    expect(beyondNeg.container.querySelector('rect')?.getAttribute('width')).toBe('50')
    expect(beyondNeg.container.querySelector('rect')?.getAttribute('fill')).toBe(LEFT)
  })

  it('renders no bar rect when value is zero', () => {
    const { container } = render(<DivergingBar {...base} value={0} />)
    expect(container.querySelector('rect')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('derives geometry from default dimensions when width/height are omitted', () => {
    const { container } = render(
      <DivergingBar value={5} extent={10} leftColor={LEFT} rightColor={RIGHT} />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('80')
    expect(svg?.getAttribute('height')).toBe('8')
    const rect = container.querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('40') // default cx = 80/2
    expect(rect?.getAttribute('width')).toBe('20') // (5/10) * 40
  })

  it('exposes role="img" + aria-label when ariaLabel is set, else aria-hidden', () => {
    const labeled = render(
      <DivergingBar {...base} value={5} ariaLabel="VWAP distance" />,
    )
    expect(labeled.container.querySelector('svg')?.getAttribute('role')).toBe('img')
    expect(
      labeled.container.querySelector('svg')?.getAttribute('aria-label'),
    ).toBe('VWAP distance')
    labeled.unmount()

    const bare = render(<DivergingBar {...base} value={5} />)
    expect(bare.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(bare.container.querySelector('svg')?.getAttribute('role')).toBeNull()
  })
})

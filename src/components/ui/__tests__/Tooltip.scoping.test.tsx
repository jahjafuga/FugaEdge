// @vitest-environment jsdom
//
// HOTFIX (69ade1c regression) — the house Tooltip moves to a NAMED Tailwind
// group (group/tt), self-scoping and immune to ancestor .group collisions
// (the calendar DayCell is itself a .group, so the unnamed variant revealed
// the sentiment tooltip on CELL hover). Also: focus-within reveal becomes a
// default-on prop (hover-only triggers like the tabIndex=-1 badge drop it),
// and an optional ~400ms open delay guards fast pointer traversal.

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Tooltip, { InfoIcon } from '../Tooltip'

function renderTip(props: Record<string, unknown> = {}) {
  const { container } = render(
    <Tooltip content="rubric" {...props}>
      <span>trigger</span>
    </Tooltip>,
  )
  const wrapper = container.firstElementChild as HTMLElement
  const pop = wrapper.querySelector('[role="tooltip"]') as HTMLElement
  return { wrapper, pop }
}

describe('Tooltip — named-group scoping (the hotfix)', () => {
  it('(1) the wrapper carries the NAMED group only — no unnamed group token', () => {
    const { wrapper } = renderTip()
    const classes = wrapper.className.split(/\s+/)
    expect(classes).toContain('group/tt')
    expect(classes).not.toContain('group')
  })

  it('(1b) the popover reveals on the named variant only — no unnamed group-hover/focus remains', () => {
    const { pop } = renderTip()
    expect(pop.className).toContain('group-hover/tt:visible')
    expect(pop.className).toContain('group-hover/tt:opacity-100')
    expect(pop.className).not.toMatch(/(^|\s)group-hover:visible/)
    expect(pop.className).not.toMatch(/(^|\s)group-focus-within:visible/)
  })

  it('(1c) focus-within reveal is default-ON (named), and focusable={false} drops it', () => {
    const { pop } = renderTip()
    expect(pop.className).toContain('group-focus-within/tt:visible')
    const { pop: hoverOnly } = renderTip({ focusable: false })
    expect(hoverOnly.className).not.toContain('focus-within')
  })

  it('(1d) openDelay adds the ~400ms reveal delay; the base keeps instant close; default has no delay', () => {
    const { pop } = renderTip({ openDelay: true })
    expect(pop.className).toContain('group-hover/tt:delay-[400ms]')
    expect(pop.className).toContain('delay-0')
    const { pop: plain } = renderTip()
    expect(plain.className).not.toContain('delay-[400ms]')
  })

  it('(1e) InfoIcon highlights on the named group, not the unnamed one', () => {
    const { container } = render(
      <Tooltip content="x">
        <InfoIcon />
      </Tooltip>,
    )
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('class') ?? '').toContain('group-hover/tt:text-gold')
    expect(svg.getAttribute('class') ?? '').not.toMatch(/(^|\s)group-hover:text-gold/)
  })
})

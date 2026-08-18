// v0.2.7 Bug 4 — the catalyst pencil that would not open.
//
// TWO defects, confirmed by recon:
//   RACE     CatalystField registered a document 'click' listener that closes on
//            any click outside `wrapRef`, but wrapRef was attached ONLY to the
//            EDITING branch. The pencil lives in the other branch, so it was never
//            inside the guarded subtree: if that listener ever observed the opening
//            click, contains() returned false and it closed again immediately.
//            CountryEditor's identical 24px pencil works because it has no document
//            listener at all — a <Modal> owns its dismissal.
//   GEOMETRY the trigger was 24x24, under the 32x32 minimum. Two people
//            independently failed to hit it.
//
// MEASUREMENT NOTE: jsdom performs NO layout, so getBoundingClientRect is all
// zeros and Tailwind classes resolve to nothing. Sizes are therefore asserted from
// INLINE STYLES on the rendered elements — real values read off the DOM, not class
// strings — which is also why the cure states its geometry inline.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CatalystField } from '../TradeDetailModal'

vi.mock('@/lib/ipc', () => ({
  ipc: { catalystDefsGet: vi.fn(() => Promise.resolve([])) },
}))

const setup = () =>
  render(<CatalystField catalystType="Earnings" daysSince={3} onChange={vi.fn()} />)

const trigger = () => screen.getByLabelText('Edit catalyst')
const isOpen = () => screen.queryByText('Done') !== null

describe('CatalystField — the reveal', () => {
  it('T1 one click on the pencil opens the panel AND it is still open after effects flush', () => {
    setup()
    expect(isOpen()).toBe(false)
    fireEvent.click(trigger())
    // The race: the document listener registered by the open effect must not be
    // able to treat the opening click as an outside click.
    expect(isOpen()).toBe(true)
  })

  it('T2 the trigger lives INSIDE the guarded subtree, so its own click can never read as outside', () => {
    setup()
    // THE STRUCTURAL FORM OF THE RACE. T1 above cannot go red under jsdom, whose
    // scheduler flushes the open effect after the click has finished bubbling, so
    // the document listener never sees it. In a real browser the flush can land
    // mid-bubble and it does. What is deterministic in BOTH is containment: the
    // guarded root must hold the trigger while closed AND the panel while open, so
    // contains() is true either way and the ordering stops mattering.
    const root = trigger().closest('[data-reveal-root]')
    expect(root).not.toBeNull()
    fireEvent.click(trigger())
    expect(isOpen()).toBe(true)
    expect(root!.contains(screen.getByText('Done'))).toBe(true)
  })

  it('T3 the trigger hit area is at least 32x32 CSS px', () => {
    setup()
    const btn = trigger()
    const visual = Number.parseFloat(btn.style.width)
    const hit = btn.querySelector<HTMLElement>('[data-hit-area]')
    expect(hit).not.toBeNull()
    // An absolutely-positioned overlay inset by a negative amount on all sides.
    const grow = Math.abs(Number.parseFloat(hit!.style.left))
    expect(Math.abs(Number.parseFloat(hit!.style.top))).toBe(grow)
    expect(Math.abs(Number.parseFloat(hit!.style.right))).toBe(grow)
    expect(Math.abs(Number.parseFloat(hit!.style.bottom))).toBe(grow)
    expect(visual + grow * 2).toBeGreaterThanOrEqual(32)
  })

  it('T4 the VISUAL footprint is unchanged at 24x24 — no layout shift', () => {
    setup()
    const btn = trigger()
    expect(Number.parseFloat(btn.style.width)).toBe(24)
    expect(Number.parseFloat(btn.style.height)).toBe(24)
    // The enlarged region must be OUT OF FLOW, or the row grows.
    const hit = btn.querySelector<HTMLElement>('[data-hit-area]')
    expect(hit!.style.position).toBe('absolute')
  })

  it('T5 clicking the icon glyph and the hit overlay both open it — nothing swallows', () => {
    const { unmount } = setup()
    const glyph = trigger().querySelector('svg')
    fireEvent.click(glyph!)
    expect(isOpen()).toBe(true)
    unmount()

    setup()
    const overlay = trigger().querySelector<HTMLElement>('[data-hit-area]')
    fireEvent.click(overlay!)
    expect(isOpen()).toBe(true)
  })

  it('T6 STAND-DOWN: a click genuinely outside the trigger and panel still closes it', () => {
    setup()
    fireEvent.click(trigger())
    expect(isOpen()).toBe(true)
    fireEvent.click(document.body)
    expect(isOpen()).toBe(false)
  })
})

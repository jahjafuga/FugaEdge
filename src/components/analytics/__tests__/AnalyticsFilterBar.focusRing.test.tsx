// @vitest-environment jsdom
//
// BEAT 299 -- the ring belongs to the key, not to the group.
//
// THE DEFECT: AnalyticsFilterBar wrapped each Segment in a span carrying RING
// (:103-104), whose live half is `focus-within:shadow-glow-gold`. focus-within
// fires when ANY descendant holds focus, and a clicked button holds focus, so
// the whole group glowed on a mouse click. The `focus-visible:` half of that
// same constant is inert on those spans: a span is not focusable, so it never
// matches focus-visible itself.
//
// THE CURE IS A REMOVAL. The individual control already has a keyboard-only
// ring from the global stylesheet (src/index.css:453-462 gives every
// button:focus-visible a gold box-shadow), so nothing is added to the shared
// Segment; the group simply stops claiming the focus.
//
// CLASS-LEVEL AND TEXT-LEVEL BY NECESSITY: jsdom does not evaluate :focus-within
// or :focus-visible, so a guard cannot observe the paint. It asserts the class
// is absent from the rendered container, and that the global rule that rings
// the control is present in the stylesheet.
import { render, cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import AnalyticsFilterBar from '@/components/analytics/AnalyticsFilterBar'
import { emptyFilters } from '@/core/performance/filters'
import { makeTrade } from '@/test/fixtures/trade'

const TRADES = [
  makeTrade({ id: 1, side: 'long', net_pnl: 10, playbook_name: 'Bull Flag' }),
  makeTrade({ id: 2, side: 'short', net_pnl: -4, playbook_name: 'Other' }),
]

function mount() {
  return render(
    <AnalyticsFilterBar
      trades={TRADES}
      filters={emptyFilters()}
      onFiltersChange={() => {}}
    />,
  )
}

/** Every Segment root, by the class string Segment.tsx:15 renders.
 *  SCOPED BY p-0.5: the bar's FIELD skeleton (:97-98) shares every other
 *  class in that selector, so a looser probe also catches the symbol box,
 *  which holds an input and no selected key. */
const segmentRoots = () =>
  [...document.querySelectorAll('div.inline-flex.h-8.items-center.p-0\\.5')]

afterEach(cleanup)

describe('G38 the focus ring is on the key, not the group', () => {
  it('no group container claims focus, and the control has a keyboard ring', () => {
    mount()
    const roots = segmentRoots()
    expect(roots.length, 'no Segment rendered to check').toBeGreaterThan(0)
    for (const root of roots) {
      const container = root.parentElement!
      expect(
        container.className,
        'a Segment wrapper still carries a focus-within ring: ' + container.className,
      ).not.toContain('focus-within')
      expect(root.className).not.toContain('focus-within')
    }
    // The control's keyboard-only ring, from the app's OWN global idiom.
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const flat = css.split(/\s+/).join(' ')
    expect(
      flat.includes('button:focus-visible'),
      'the global keyboard ring for buttons is gone from index.css',
    ).toBe(true)
  })

  it('the keys are still real buttons, so the global ring can reach them', () => {
    mount()
    const keys = segmentRoots().flatMap((r) => [...r.querySelectorAll('button')])
    expect(keys.length, 'the Segment keys are not buttons any more').toBeGreaterThan(0)
    for (const k of keys) expect(k.tagName).toBe('BUTTON')
  })
})

describe('G39 PIN: exactly one key reads as selected', () => {
  it('one selected key per Segment, on the default value', () => {
    mount()
    for (const root of segmentRoots()) {
      const selected = [...root.querySelectorAll('button')].filter((b) =>
        b.className.includes('text-gold'),
      )
      expect(selected.length, 'more than one key styled selected').toBe(1)
    }
  })

  it('and one after the side facet is driven to a non-default value', () => {
    cleanup()
    render(
      <AnalyticsFilterBar
        trades={TRADES}
        filters={{ ...emptyFilters(), side: 'short' }}
        onFiltersChange={() => {}}
      />,
    )
    const sideRoot = document
      .querySelector('[data-facet="side"]')!
      .querySelector('div.inline-flex.h-8')!
    const selected = [...sideRoot.querySelectorAll('button')].filter((b) =>
      b.className.includes('text-gold'),
    )
    expect(selected.length).toBe(1)
    expect(selected[0].textContent).toBe('Short')
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})

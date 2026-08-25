// @vitest-environment jsdom
//
// v0.2.7 — THE TECHNICALS BAR WEARS THE CARD. Written RED, before the surface
// change, and RENDERING the bar for real rather than reading its source.
//
// The spec (v0.2.4 §B) asked for a bar "sticky on scroll, ~56px" that "mirrors
// the existing Deep Analytics filter conventions". It was built exactly that
// way. What it mirrored was the treatment Deep Analytics has since moved AWAY
// from: a translucent blurred strip bleeding edge to edge under a hairline. The
// reference bar now wears one elevated card surface, and the reason is recorded
// at AnalyticsFilterBar.tsx:217-220 — at ninety-five percent opacity the blur
// was invisible, it cost a compositor layer on every scroll frame, and
// backdrop-filter creates a stacking context that trapped an overlay inside the
// bar's own bounds. This is a spec reversal on the founder's word, not a defect.
//
// THE RULINGS:
//   R22 SURFACE ONLY. The container's look changes and nothing else.
//   R24 THE COUNT STAYS ON ITS OWN ROW.
//   R25 POSITION IS NOT THE FIX. Both bars are already sticky; this one stays
//       sticky.
//   R26 THE ELEVATION STEP IS EXCLUDED. The reference deepens its shadow when
//       pinned, driven by a sentinel and an IntersectionObserver in a SECOND
//       file (OverviewTab.tsx:93-98). This bar takes a STATIC shadow instead.
//   R27 z-20 becomes z-30, matching the reference, because an opaque surface
//       has to layer the way the reference's does.
//   R28 font-sans and mb-4 are this bar's own and are not surface tokens.
//
// RF4, RF5 AND RF6 GUARD WHAT MUST NOT CHANGE and are green before the cure.
// A guard that is green from the start proves nothing on its own, so two plants
// exist purely to redden them: removing a control, and moving the count inside
// the row. Without those, "scope was not exceeded" would be an assertion about
// nothing.

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TechnicalsFilterBar, {
  type TechnicalsFilters,
} from '@/components/analytics/tabs/technicals/TechnicalsFilterBar'

afterEach(() => cleanup())

const FILTERS: TechnicalsFilters = {
  range: null,
  ticker: '',
  playbookName: null,
  datePreset: '30d',
  timeframe: '1m',
}

function mount(over: Partial<TechnicalsFilters> = {}, excludedCount = 0) {
  const onFiltersChange = vi.fn()
  const { container } = render(
    <TechnicalsFilterBar
      filters={{ ...FILTERS, ...over }}
      onFiltersChange={onFiltersChange}
      playbookOptions={[]}
      excludedCount={excludedCount}
      scopeLabel="140 round trips in the last thirty days"
    />,
  )
  return { container, onFiltersChange }
}

/** The bar's outermost element — the container this beat is about. */
const shell = (container: HTMLElement) => container.firstElementChild as HTMLElement
const shellClasses = (container: HTMLElement) => (shell(container).className || '').split(/\s+/)

// ─── RF1 ─────────────────────────────────────────────────────────────────────

describe('RF1 the container drops the retired translucent treatment', () => {
  it('no backdrop-blur', () => {
    const { container } = mount()
    expect(
      shellClasses(container),
      'the blur is invisible at ninety-five percent, costs a compositor layer ' +
        'per scroll frame, and traps overlays in a stacking context',
    ).not.toContain('backdrop-blur')
  })

  it('no translucent bg-bg-1/95', () => {
    const { container } = mount()
    expect(shellClasses(container)).not.toContain('bg-bg-1/95')
  })

  it('and no hairline-only bottom border', () => {
    const { container } = mount()
    expect(shellClasses(container), 'a bottom hairline is the strip idiom').not.toContain(
      'border-b',
    )
  })
})

// ─── RF2 ─────────────────────────────────────────────────────────────────────

describe('RF2 the container wears the card surface', () => {
  it('a full border, not an edge', () => {
    const { container } = mount()
    const cls = shellClasses(container)
    expect(cls).toContain('border')
    expect(cls).toContain('border-border-subtle')
  })

  it('the card background', () => {
    const { container } = mount()
    expect(shellClasses(container)).toContain('bg-bg-2')
  })

  it('the card radius, by token', () => {
    const { container } = mount()
    expect(
      shellClasses(container),
      'the radius must come from --card-radius, not a hardcoded step',
    ).toContain('rounded-[var(--card-radius)]')
  })

  it('and a shadow', () => {
    const { container } = mount()
    expect(shellClasses(container).some((c) => c.startsWith('shadow-'))).toBe(true)
  })

  it('a STATIC one — the elevation step is excluded (R26)', () => {
    // The reference animates between two shadows when it pins. That needs a
    // sentinel and an observer in a second file, and this beat does not
    // replicate them, so there is nothing to transition.
    const { container } = mount()
    const cls = shellClasses(container)
    expect(cls, 'a transition with nothing to animate').not.toContain('transition-shadow')
  })
})

// ─── RF3 ─────────────────────────────────────────────────────────────────────

describe('RF3 the container stops bleeding edge to edge', () => {
  it('no negative gutter', () => {
    const { container } = mount()
    expect(
      shellClasses(container),
      'a card that bleeds past its own padding is not a card',
    ).not.toContain('-mx-4')
  })
})

// ─── RF4 : GREEN BEFORE THE CURE ─────────────────────────────────────────────

describe('RF4 the bar is STILL sticky (R25)', () => {
  it('sticky, pinned to the top', () => {
    const { container } = mount()
    const cls = shellClasses(container)
    expect(cls, 'position is not the fix and must not change').toContain('sticky')
    expect(cls).toContain('top-0')
  })

  it('and it layers at the reference depth (R27)', () => {
    const { container } = mount()
    expect(shellClasses(container)).toContain('z-30')
  })
})

// ─── RF5 : GREEN BEFORE THE CURE — THE SCOPE GUARD ───────────────────────────

describe('RF5 every control still renders, in order', () => {
  // Order, not merely presence: a surface change that reshuffled the row would
  // pass a presence check completely.
  it('the row is ticker, playbook, five presets, From, To, two timeframes', () => {
    const { container } = mount()
    const row = shell(container).querySelector('div')!
    const controls = Array.from(
      row.querySelectorAll('input, select, button'),
    ) as HTMLElement[]
    const shape = controls.map((el) => {
      if (el.tagName === 'SELECT') return 'select'
      if (el.tagName === 'BUTTON') return el.textContent!.trim()
      const t = (el as HTMLInputElement).type
      return t === 'date' ? 'date' : 'text'
    })
    expect(shape).toEqual([
      'text', // ticker
      'select', // playbook
      'Today',
      '7D',
      '30D',
      '90D',
      'YTD',
      'date', // From
      'date', // To
      '1M',
      '5M',
    ])
  })

  it('the playbook select still offers the all option', () => {
    mount()
    expect(screen.getByRole('option', { name: '— All —' })).toBeTruthy()
  })

  it('and the excluded chip still appears when the gate drops rows', () => {
    mount({}, 7)
    expect(screen.getByText(/7 excluded/)).toBeTruthy()
  })
})

// ─── RF6 : GREEN BEFORE THE CURE — THE SCOPE GUARD ───────────────────────────

describe('RF6 the count stays on its own row (R24)', () => {
  it('it is a sibling of the flex row, not inside it', () => {
    const { container } = mount()
    const box = shell(container)
    const row = box.querySelector('div')!
    const count = screen.getByText('140 round trips in the last thirty days')
    expect(row.contains(count), 'the count moved inside the control row').toBe(false)
    expect(box.contains(count), 'the count left the bar entirely').toBe(true)
  })

  it('and it comes AFTER the row in document order', () => {
    const { container } = mount()
    const box = shell(container)
    const row = box.querySelector('div')!
    const count = screen.getByText('140 round trips in the last thirty days')
    const pos = row.compareDocumentPosition(count)
    // CONTAINED_BY must be excluded explicitly. A node INSIDE the row also
    // reports FOLLOWING -- the spec sets both bits -- so a bare FOLLOWING check
    // passes for the very arrangement this test forbids. Measured: the plant
    // that moved the count into the row left this assertion green.
    // eslint-disable-next-line no-bitwise
    expect(pos & Node.DOCUMENT_POSITION_CONTAINED_BY, 'the count is inside the row').toBe(0)
    // eslint-disable-next-line no-bitwise
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

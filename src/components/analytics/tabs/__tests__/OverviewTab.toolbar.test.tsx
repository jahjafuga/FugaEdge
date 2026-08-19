// @vitest-environment jsdom
// v0.2.7 design candidate — the filter card becomes a toolbar.
//
// The pinned bar was a full Card: an eyebrow reading FILTERS above a description
// reading "Symbol, side, and range — expand for more", above the controls. Both
// strings described controls that were already visible, and the whole block was
// pinned to the top of a long scrolling tab, so it cost more of the viewport than
// the widgets it governs.
//
// The scope line is the most important status on the page — it is the only thing
// that says you are looking at a subset — so it moves into the row and is promoted
// the moment anything narrows.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewTab from '../OverviewTab'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

// jsdom has no IntersectionObserver either; the stuck-detection sentinel needs one.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
  IntersectionObserverStub

const TRADES: TradeListRow[] = [
  makeTrade({
    id: 1, symbol: 'AAAA', date: '2026-08-10',
    open_time: '2026-08-10T13:30:00Z', close_time: '2026-08-10T14:00:00Z',
    net_pnl: 500, gross_pnl: 510, total_fees: 10,
  }),
  makeTrade({
    id: 2, symbol: 'BBBB', date: '2026-08-11',
    open_time: '2026-08-11T13:30:00Z', close_time: '2026-08-11T14:00:00Z',
    net_pnl: -200, gross_pnl: -190, total_fees: 10,
  }),
]

const renderTab = () =>
  render(
    <MemoryRouter>
      <OverviewTab trades={TRADES} />
    </MemoryRouter>,
  )

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const scopeEl = () => screen.getByTestId('overview-scope')

beforeEach(() => document.body.replaceChildren())

// ── T4 ──────────────────────────────────────────────────────────────────────
describe('T4 RESET renders only when there is something to reset', () => {
  it('is absent on arrival, with nothing narrowed', () => {
    renderTab()
    expect(screen.queryByTitle('Reset all filters')).toBeNull()
  })

  it('appears the moment a non-date filter narrows the set', () => {
    renderTab()
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(screen.getByTitle('Reset all filters')).toBeTruthy()
  })

  it('appears for a date range too — a window is a subset like any other', () => {
    renderTab()
    fireEvent.click(screen.getByText('7D'))
    expect(screen.getByTitle('Reset all filters')).toBeTruthy()
  })
})

// ── the scope line's promotion ──────────────────────────────────────────────
describe('the scope line is quiet at rest and impossible to miss when narrowed', () => {
  it('renders inside the toolbar row, not below it', () => {
    renderTab()
    const strip = screen.getByTestId('overview-toolbar')
    expect(strip.contains(scopeEl())).toBe(true)
  })

  it('is muted while the whole book is in view', () => {
    renderTab()
    const cls = scopeEl().className
    expect(cls).toContain('text-fg-tertiary')
    expect(cls).not.toContain('text-gold')
  })

  it('is promoted the moment anything narrows', () => {
    renderTab()
    const before = scopeEl().className
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    const after = scopeEl().className
    expect(after).not.toBe(before)
    expect(after).toContain('text-gold')
    expect(after).not.toContain('text-fg-tertiary')
  })

  it('is promoted for a date range as well', () => {
    renderTab()
    fireEvent.click(screen.getByText('7D'))
    expect(scopeEl().className).toContain('text-gold')
  })

  it('still says what it said before — the words are unchanged, only the weight', () => {
    renderTab()
    expect(scopeEl().textContent).toBe('2 of 2 round trips · All time')
    fireEvent.change(screen.getByPlaceholderText('Symbol'), { target: { value: 'AAAA' } })
    expect(scopeEl().textContent).toBe('1 of 2 round trip · Filtered')
  })
})

// ── T5 ──────────────────────────────────────────────────────────────────────
describe('T5 the removed strings stay removed', () => {
  const BAR = 'src/components/analytics/AnalyticsFilterBar.tsx'

  it('the FILTERS eyebrow and its description are gone from the source', () => {
    const bar = src(BAR)
    // Both described controls that are visible on the row beneath them, and both
    // cost vertical space on a bar pinned to the top of a long tab.
    expect(bar).not.toContain('Symbol, side, and range')
    expect(bar).not.toMatch(/title="Filters"/)
  })

  it('the strip is no longer a Card — a control strip is not a content container', () => {
    const bar = src(BAR)
    expect(bar).not.toMatch(/<Card\b/)
    expect(bar).not.toMatch(/from '@\/components\/ui\/Card'/)
  })

  it('backdrop-blur is gone — invisible at 95%, and its stacking context traps the overlay', () => {
    // Matched inside className strings only: the source comments explain WHY the
    // blur was removed, and a bare substring search would flag its own rationale.
    const classAttrs = (p: string) =>
      (src(p).match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) ?? []).join(' ')
    expect(classAttrs(BAR)).not.toContain('backdrop-blur')
    expect(classAttrs('src/components/analytics/tabs/OverviewTab.tsx')).not.toContain(
      'backdrop-blur',
    )
  })

  it('and nothing renders the word Filters as a heading any more', () => {
    renderTab()
    const headings = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Filters',
    )
    expect(headings).toEqual([])
  })
})
// ── T5 ──────────────────────────────────────────────────────────────────────
describe('T5 the MORE FILTERS panel does not change the bar own height', () => {
  const bar = () => screen.getByTestId('overview-toolbar')
  const openPanel = () =>
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))

  it('opens PORTALED OUT of the bar tree entirely', () => {
    renderTab()
    openPanel()
    const panel = screen.getByTestId('overview-more-panel')
    // Not in the bar, and not even in the bar's positioning context: the sticky
    // wrapper is a stacking context and anything left inside it is capped at the
    // wrapper's z-index no matter what it declares.
    expect(bar().contains(panel)).toBe(false)
    expect((bar().parentElement as HTMLElement).contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
  })

  it('anchors to the bar bottom edge with a gap, matching its width', () => {
    renderTab()
    openPanel()
    const panel = screen.getByTestId('overview-more-panel') as HTMLElement
    // jsdom reports a zero rect, so the numbers are 0-based — what is asserted is
    // that the panel is POSITIONED FROM THE BAR at all rather than left to CSS.
    expect(panel.style.top).not.toBe('')
    expect(panel.style.left).not.toBe('')
    expect(panel.style.width).not.toBe('')
    expect(panel.className).toContain('fixed')
  })

  it('the bar keeps exactly the same class list open and closed', () => {
    renderTab()
    const closed = bar().className
    openPanel()
    expect(bar().className).toBe(closed)
  })

  it('a click on the backdrop closes it', () => {
    renderTab()
    openPanel()
    expect(screen.getByTestId('overview-more-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('overview-more-backdrop'))
    expect(screen.queryByTestId('overview-more-panel')).toBeNull()
  })
})

// ── T6 ──────────────────────────────────────────────────────────────────────
describe('T6 every token the bar uses resolves in BOTH themes', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
  const barSrc = () => src('src/components/analytics/AnalyticsFilterBar.tsx')
  /** Everything from the light-theme block onward. The app selects light with
   *  `:root.light`, not a data attribute — see src/index.css. */
  const lightBlock = css.slice(css.indexOf(':root.light'))

  it('the light-theme block exists to compare against', () => {
    expect(css).toContain(':root.light')
    expect(lightBlock.length).toBeGreaterThan(1000)
  })

  it('every CSS variable the bar names by hand is redefined for light', () => {
    const vars = new Set(
      Array.from(barSrc().matchAll(/var\((--[a-z0-9-]+)\)/g)).map((m) => m[1]),
    )
    expect(vars.size, 'the bar names no CSS var — did rounded-[var(--card-radius)] go?')
      .toBeGreaterThan(0)
    for (const v of vars) {
      expect(lightBlock.includes(v + ':'), v + ' has no light-mode value').toBe(true)
    }
  })

  it('every surface, border and accent token behind its classes is themed', () => {
    // bg-bg-1 / bg-bg-2, border-subtle / border-strong, gold, and the two shadows.
    for (const t of [
      '--bg-0', '--bg-1', '--bg-2',
      '--border-subtle', '--border-strong',
      '--gold',
      '--shadow-md', '--shadow-lg',
    ]) {
      expect(css.includes(t + ':'), t + ' missing from :root').toBe(true)
      expect(lightBlock.includes(t + ':'), t + ' missing from the light theme').toBe(true)
    }
  })

  it('the shadow steps between two themed tokens rather than a literal', () => {
    expect(barSrc()).toContain('shadow-lg')
    expect(barSrc()).toContain('shadow-md')
    // No raw rgba/hex shadows smuggled in beside them.
    expect(barSrc()).not.toMatch(/shadow-\[/)
  })
})

// ── Candidate 3: ONE SURFACE, and the panel wins ────────────────────────────
describe('T1/T2 the wrapper positions; the BAR is the only surface', () => {
  const TAB = 'src/components/analytics/tabs/OverviewTab.tsx'

  /** The sticky wrapper's className, read from source. */
  const wrapperClass = (): string => {
    const m = src(TAB).match(/className="(sticky top-0[^"]*)"/)
    expect(m, 'sticky wrapper not found').toBeTruthy()
    return (m as RegExpMatchArray)[1]
  }

  it('T1 the wrapper paints nothing — no background, border or shadow', () => {
    const cls = wrapperClass()
    // bg-bg-0 here stamped a flat slab over .app-aurora, the app's real backdrop.
    expect(cls).not.toMatch(/\bbg-/)
    expect(cls).not.toMatch(/\bborder(-|\b)/)
    expect(cls).not.toMatch(/\bshadow-/)
    // It still positions, which is its whole job.
    expect(cls).toContain('sticky')
  })

  it('T2 exactly ONE of the wrapper and the bar carries a background', () => {
    renderTab()
    const bar = screen.getByTestId('overview-toolbar')
    const wrapper = bar.parentElement?.parentElement as HTMLElement
    const hasBg = (el: HTMLElement) => /\bbg-/.test(el.className)
    expect(hasBg(bar), 'the bar must be the surface').toBe(true)
    expect(hasBg(wrapper), 'the wrapper must not paint').toBe(false)
    expect([hasBg(bar), hasBg(wrapper)].filter(Boolean)).toHaveLength(1)
  })

  it('the page background behind the bar is the aurora, not a token colour', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    // If this ever stops being absolute/-1, the wrapper painting nothing is wrong.
    expect(css).toMatch(/\.app-aurora\s*\{[^}]*position:\s*absolute/)
    expect(css).toMatch(/\.app-aurora\s*\{[^}]*z-index:\s*-1/)
  })
})

describe('T3 the panel is opaque — nothing may show through it', () => {
  const BAR = 'src/components/analytics/AnalyticsFilterBar.tsx'

  const panelClass = (): string => {
    const m = src(BAR).match(/data-testid="overview-more-panel"[\s\S]{0,400}?className="([^"]*)"/)
    expect(m, 'panel className not found').toBeTruthy()
    return (m as RegExpMatchArray)[1]
  }

  it('the background token carries NO alpha channel', () => {
    const cls = panelClass()
    const bg = cls.match(/\bbg-[a-z0-9-]+(?:\/\[?[0-9.]+\]?)?/g) ?? []
    expect(bg.length).toBe(1)
    // bg-bg-2/90 or bg-bg-2/[0.9] would let the page read through.
    expect(bg[0]).not.toMatch(/\//)
    expect(bg[0]).toBe('bg-bg-2')
  })

  it('and it does NOT reuse card-premium, whose surface is 0.92 felt', () => {
    expect(panelClass()).not.toContain('card-premium')
  })

  it('carries the bar border token and a shadow at least as strong as the bar', () => {
    const cls = panelClass()
    expect(cls).toContain('border-border-subtle')
    expect(cls).toContain('shadow-lg')
  })
})

describe('T5 the panel out-ranks every stacking context measured on its chain', () => {
  const BAR = 'src/components/analytics/AnalyticsFilterBar.tsx'
  const TAB = 'src/components/analytics/tabs/OverviewTab.tsx'
  const num = (cls: string): number => {
    const m = cls.match(/z-\[?(\d+)\]?/)
    return m ? Number(m[1]) : Number.NaN
  }

  /** The z-index of the sticky wrapper — the stacking context that trapped the
   *  panel, measured from source rather than assumed. */
  const wrapperZ = () =>
    num((src(TAB).match(/className="(sticky top-0[^"]*)"/) as RegExpMatchArray)[1])

  /** TopBar is the app's chrome and the thing the trapped backdrop lost to. */
  const topBarZ = () => {
    const t = readFileSync(
      resolve(process.cwd(), 'src/components/layout/TopBar.tsx'),
      'utf8',
    )
    return num((t.match(/className="[^"]*sticky[^"]*"/) as RegExpMatchArray)[0])
  }

  const panelZ = () =>
    num(
      (src(BAR).match(
        /data-testid="overview-more-panel"[\s\S]{0,400}?className="([^"]*)"/,
      ) as RegExpMatchArray)[1],
    )
  const backdropZ = () =>
    num(
      (src(BAR).match(
        /data-testid="overview-more-backdrop"[\s\S]{0,300}?className="([^"]*)"/,
      ) as RegExpMatchArray)[1],
    )

  it('the measured values are all real numbers', () => {
    for (const v of [wrapperZ(), topBarZ(), panelZ(), backdropZ()]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('the panel beats the wrapper that used to cap it, and the app chrome', () => {
    expect(panelZ()).toBeGreaterThan(wrapperZ())
    expect(panelZ()).toBeGreaterThan(topBarZ())
  })

  it('the dismiss backdrop also clears the chrome, so a click anywhere closes', () => {
    expect(backdropZ()).toBeGreaterThan(topBarZ())
    expect(backdropZ()).toBeLessThan(panelZ())
  })

  it('but the panel stays BELOW modal chrome — a popover must not outrank a modal', () => {
    // 50 is the app's modal tier (9 uses); 60 the activation wall.
    expect(panelZ()).toBeLessThan(50)
  })
})

// ── Candidate 4: the vertical space is REDISTRIBUTED, not inflated ──────────
//
// Every number below is DERIVED from the source's own classes through the same

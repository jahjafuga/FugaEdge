// @vitest-environment jsdom
// v0.2.7 — the gold wash, and the odd button.
//
// THE WASH. .card-glow-gold anchors a radial bloom at the card's TOP-LEFT, sized
// 120% and fading out at 60% of that. On the small tiles that use it — score
// cards, stat strips, badges, the four detail cards — that is a corner highlight.
// On a table card a thousand pixels wide it reaches most of the way across the
// first columns, and once the rows went transparent there was nothing painted over
// it any more. The class is right; this card is the wrong size for it.
//
// THE BUTTON. Columns sat beside the view switcher at a different height, weight,
// size, padding, surface and hover — nine properties apart. It now shares the
// switcher's metric so the two read as equals, while keeping the chevron and
// popover of the app's menu triggers, because it opens a menu rather than
// selecting a view.

import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import ColumnsMenu from '@/components/trades/ColumnsMenu'
import TradesViewToggle from '@/components/trades/TradesViewToggle'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY } from '@/lib/prefs/columns'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/mockVirtualizer')).passthroughVirtualizer,
}))

const noop = async () => {}
const PROPS = {
  onSaveNote: noop, onSaveTimeframe: noop, onSavePlaybook: noop,
  onSaveConfidence: noop, onSavePlannedRisk: noop, onSavePlannedStopLoss: noop,
  onSaveFloat: noop, onSaveCatalyst: noop, onSaveCountry: noop,
}
const TRADES: TradeListRow[] = [makeTrade({ id: 1, symbol: 'INLF', date: '2026-08-05' })]
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const classOf = (el: Element) => el.getAttribute('class') ?? ''
const tokens = (el: Element) => classOf(el).split(/\s+/)

beforeEach(() => localStorage.clear())

describe('T1 the table card does not apply the gold glow', () => {
  it('the rendered card carries card-premium and not the bloom', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const card = document.querySelector('.card-premium') as HTMLElement
    expect(card, 'no premium card rendered').toBeTruthy()
    expect(tokens(card)).toContain('card-premium')
    expect(
      tokens(card),
      'the bloom is anchored top-left and reaches across the first columns here',
    ).not.toContain('card-glow-gold')
  })

  it('the CLASS is untouched — eleven other cards use it correctly', () => {
    const css = src('src/index.css')
    expect(css).toContain('.card-glow-gold')
    // Both theme definitions still there; only this consumer dropped it.
    expect(css).toMatch(/:root\.light \.card-glow-gold/)
  })
})

describe('T2 the table card and the filter card resolve the same surface', () => {
  it('both are card-premium, and neither adds another surface class', () => {
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const table = tokens(document.querySelector('.card-premium') as Element)
    const page = src('src/pages/Trades.tsx')
    const filterCard = (page.match(/className="(card-premium[^"]*)"/) as RegExpMatchArray)[1]
    const surfaceOf = (list: string[]) =>
      list.filter((c) => c.startsWith('card-') || c.startsWith('bg-')).sort()
    expect(surfaceOf(table)).toEqual(surfaceOf(filterCard.split(/\s+/)))
    expect(surfaceOf(table)).toEqual(['card-premium'])
  })
})

describe('T3 COLUMNS shares the view switcher metric', () => {
  const metric = (cls: string) => ({
    height: cls.split(/\s+/).find((c) => /^h-\d+$/.test(c)),
    radius: cls.split(/\s+/).find((c) => c.startsWith('rounded')),
    border: cls.split(/\s+/).find((c) => /^border-border-/.test(c)),
    hover: cls.split(/\s+/).filter((c) => c.startsWith('hover:')).sort(),
  })

  it('height, radius and border token match an unselected SEGMENT', () => {
    // The metric moved off the container and onto the segments themselves when
    // each became a pressable object, so the comparison is segment-to-trigger.
    // The container is now bare: it groups, it does not draw.
    render(<TradesViewToggle value="table" onChange={() => {}} />)
    const container = document.querySelector('[role="tablist"]') as HTMLElement
    const inactiveSeg = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (b) => b.getAttribute('aria-selected') !== 'true',
    ) as HTMLElement
    const segment = metric(classOf(inactiveSeg))
    expect(classOf(container), 'the container still draws chrome').not.toMatch(/border/)
    document.body.replaceChildren()

    render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    const trigger = metric(classOf(screen.getByTestId('columns-button')))

    expect(trigger.height, 'height differs').toBe(segment.height)
    expect(trigger.radius, 'radius differs').toBe(segment.radius)
    expect(trigger.border, 'border token differs').toBe(segment.border)
    expect(trigger.hover, 'hover differs').toEqual(segment.hover)
    expect(trigger.height).toBe('h-8')
  })

  it('and the same resting surface and hover behaviour', () => {
    render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    const cls = classOf(screen.getByTestId('columns-button'))
    expect(cls).toContain('bg-bg-2')
    expect(cls).toContain('hover:bg-bg-3')
    expect(cls).toContain('hover:text-fg-primary')
    // and the switcher's type, so they do not read as different weights
    expect(cls).toContain('text-[11px]')
    expect(cls).toContain('font-semibold')
  })
})

describe('T4 but it still reads as a TRIGGER, not a fourth view', () => {
  it('it is not inside the segmented container', () => {
    render(
      <div>
        <TradesViewToggle value="table" onChange={() => {}} />
        <ColumnsMenu visibility={{}} onChange={() => {}} />
      </div>,
    )
    const tablist = document.querySelector('[role="tablist"]') as HTMLElement
    const trigger = screen.getByTestId('columns-button')
    expect(tablist.contains(trigger), 'Columns is inside the view switcher').toBe(false)
    expect(trigger.getAttribute('role')).not.toBe('tab')
  })

  it('it carries a chevron and announces itself as a menu', () => {
    render(<ColumnsMenu visibility={{}} onChange={() => {}} />)
    const trigger = screen.getByTestId('columns-button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // Two icons: the columns glyph and the chevron.
    expect(trigger.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2)
  })

  it('and it matches the app menu-trigger idiom rather than a third style', () => {
    // ColumnsMenu is a thin wrapper now: the trigger and popover markup this
    // guard is ABOUT moved to ui/ToggleMenu in the chooser extraction. Same
    // assertion, same intent, pointed at the file that carries the idiom. The
    // DOM companion above (two svgs, aria-haspopup) is untouched and still the
    // thing that would catch an actual regression.
    const menu = src('src/components/ui/ToggleMenu.tsx')
    const idiom = src('src/components/ui/MultiSelectMenu.tsx')
    for (const shared of ['ChevronDown', 'fixed inset-0 z-30', 'top-full', 'shadow-lg']) {
      expect(menu, `the trigger idiom uses ${shared}`).toContain(shared)
      expect(idiom).toContain(shared)
    }
  })

  it('the gap between them says they are separate things', () => {
    const page = src('src/pages/Trades.tsx')
    const block = page.slice(page.indexOf('<TradesViewToggle') - 400, page.indexOf('<TradesViewToggle'))
    expect(block, 'the two controls sit at the segment gap and read as one group')
      .toContain('gap-3')
  })
})

describe('T5 the row surface work still holds', () => {
  it('rows transparent, frozen cells opaque, hover spanning both', () => {
    const v: Record<string, boolean> = { float: true, country: true }
    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const row = Array.from(document.querySelectorAll('tbody tr')).find(
      (tr) => tr.querySelectorAll('td').length > 1,
    ) as HTMLElement
    expect(tokens(row).filter((c) => c.startsWith('bg-'))).toEqual([])
    expect(classOf(row)).toContain('group/row')
    expect(classOf(row)).toContain('hover:bg-bg-3')
    for (const td of Array.from(row.querySelectorAll('td')).filter((t) =>
      classOf(t).includes('sticky'),
    )) {
      expect(classOf(td)).toContain('pinned-surface')
      expect(classOf(td)).toContain('group-hover/row:bg-bg-3')
    }
  })
})

describe('T6 both themes', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('every token the chrome uses resolves in light too', () => {
    for (const t of ['--bg-2', '--bg-3', '--border-subtle', '--border-strong', '--gold']) {
      expect(css.includes(t + ':'), t + ' missing from :root').toBe(true)
      expect(light.includes(t + ':'), t + ' missing from light').toBe(true)
    }
  })

  it('and the named table classes have light definitions', () => {
    for (const c of ['pinned-surface', 'pinned-edge']) {
      expect(css).toContain('.' + c)
      expect(light, c + ' has no light-mode rule').toContain('.' + c)
    }
  })
})

describe('T5 the COLUMNS band is gone when the page owns the state', () => {
  it('a CONTROLLED table renders no band and no columns button of its own', () => {
    allOn()
    render(
      <TradesTable
        {...PROPS}
        trades={TRADES}
        columnVisibility={{}}
        onColumnVisibilityChange={() => {}}
      />,
    )
    // This is the real app's configuration: Trades.tsx owns the visibility, so it
    // renders the control beside the view switcher and the table shows no strip.
    expect(screen.queryByTestId('columns-button')).toBeNull()
    expect(screen.queryByTestId('columns-menu')).toBeNull()
  })

  it('an UNCONTROLLED table still mounts one, because it owns the state itself', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    expect(screen.getByTestId('columns-button')).toBeTruthy()
  })

  it('the page renders it beside the view switcher', () => {
    const page = src('src/pages/Trades.tsx')
    expect(page).toContain('ColumnsMenu')
    // Same block as the view toggle, not a strip of its own.
    const viewBlock = page.slice(page.indexOf('<TradesViewToggle'), page.indexOf('<TradesViewToggle') + 500)
    expect(viewBlock, 'Columns is not beside the view switcher').toContain('ColumnsMenu')
  })

  it('and ONE component serves both mount points', () => {
    // Still THIS file: the wrapper keeps its own testids, because they are its
    // identity and nine test files hold them. Extraction moved the markup, not
    // the handles.
    const menu = src('src/components/trades/ColumnsMenu.tsx')
    expect(menu).toContain('columns-button')
    expect(menu).toContain('columns-reset')
    // The table imports it rather than carrying a second copy of the markup.
    const bar = src('src/components/trades/TradesTable.tsx')
    expect(bar).toContain("import ColumnsMenu from")
    expect(bar).not.toMatch(/data-testid="columns-menu"/)
  })
})

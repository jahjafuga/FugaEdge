// @vitest-environment jsdom
// v0.2.7 — bg-inherit is only worth anything if the PARENT paints.
//
// MEASURED, scrolled right: the body's frozen cells were opaque and correct while
// the header's were transparent — "DATE" and "COUNTRY" painted over each other and
// the tail of "PLAYBOOK" showed through the checkbox column.
//
// CAUSE: the header's fill sat on the <thead>, but a pinned <th>'s immediate
// parent is the header <tr>, which declared no background at all. `inherit` reads
// the immediate parent and does not skip a level, so it resolved to transparent.
// The body worked by accident of structure: its parent <tr> does paint.
//
// T1 is the generalisable form. Rather than asserting the header specifically, it
// walks every element in the rendered table that uses bg-inherit and checks that
// the element it inherits FROM declares a concrete background — so the next one is
// caught wherever it appears.

import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
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
const TRADES: TradeListRow[] = [
  makeTrade({ id: 1, symbol: 'INLF', date: '2026-08-05' }),
  makeTrade({ id: 2, symbol: 'VEEE', date: '2026-08-05' }),
]
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}

/** Resting background classes on an element — variants such as hover:bg-* are not
 *  a resting colour and must not count as one. */
const classOf = (el: Element) => el.getAttribute('class') ?? ''
const restingBg = (el: Element) =>
  classOf(el)
    .split(/\s+/)
    .filter((c) => c.startsWith('bg-') && !c.startsWith('bg-gold'))
const inheritsBg = (el: Element) => restingBg(el).includes('bg-inherit')
/** A concrete resting background: a real token, or the named surface class the
 *  frozen cells paint. Anything but inherit and transparent. */
const paints = (el: Element) =>
  classOf(el).split(/\s+/).includes('pinned-surface') ||
  restingBg(el).some((c) => c !== 'bg-inherit' && c !== 'bg-transparent')

const describeEl = (el: Element) =>
  `<${el.tagName.toLowerCase()} class="${classOf(el)}">` +
  (el.textContent ? ` "${el.textContent.trim().slice(0, 20)}"` : '')

beforeEach(() => localStorage.clear())

describe('T1 nothing inherits a background from a parent that has none', () => {
  it('every bg-inherit element in the table has a painting parent', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const orphans = Array.from(document.querySelectorAll('*'))
      .filter(inheritsBg)
      .filter((el) => !el.parentElement || !paints(el.parentElement))
      .map((el) => `${describeEl(el)} inherits from ${describeEl(el.parentElement as Element)}`)
    expect(
      orphans,
      'these elements inherit a background from a parent that declares none, so ' +
        'they resolve transparent:\n' + orphans.join('\n'),
    ).toEqual([])
  })

  it('and nothing needs to inherit any more — the frozen cells carry their own', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    // The rows went transparent again so the card's felt reads through them, which
    // means a frozen cell cannot take its colour from its row. The walk above stays
    // because it is the general guard; this records that it has nothing to find.
    expect(Array.from(document.querySelectorAll('*')).filter(inheritsBg)).toEqual([])
  })
})

describe('T2 a pinned header cell resolves an opaque background', () => {
  it('every pinned header cell carries the opaque surface itself', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const pinnedTh = Array.from(document.querySelectorAll('thead th')).filter((e) =>
      classOf(e).includes('sticky'),
    )
    expect(pinnedTh.length).toBeGreaterThan(0)
    for (const th of pinnedTh) {
      expect(paints(th), 'a pinned header cell is transparent').toBe(true)
      expect(classOf(th)).toContain('pinned-surface')
    }
  })

  it('header and body frozen cells use ONE mechanism', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const frozen = Array.from(document.querySelectorAll('thead th, tbody td')).filter(
      (e) => classOf(e).includes('sticky'),
    )
    expect(frozen.length).toBeGreaterThan(4)
    for (const el of frozen) expect(classOf(el)).toContain('pinned-surface')
  })
})

describe('T3 the pinned edge reads on the header as well as the body', () => {
  it('one helper emits it, so both call sites get it', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    // Both the header cell and the body cell are built by pinnedCell.
    const calls = bar.match(/pinnedCell\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3) // the definition plus two call sites
    expect(bar).toContain('pinned-edge')
  })

  it('the header cell is built by the same helper as the body cell', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    expect(bar).toMatch(/pinnedCell\(h\.column,/)
    expect(bar).toMatch(/pinnedCell\(cell\.column,/)
  })
})

describe('T4 STAND-DOWN: the body is unchanged', () => {
  it('rows are transparent at rest and the frozen cells follow their hover', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const row = Array.from(document.querySelectorAll('tbody tr')).find(
      (tr) => tr.querySelectorAll('td').length > 1,
    ) as HTMLElement
    expect(restingBg(row), 'the row paints over the card felt').toEqual([])
    expect(classOf(row)).toContain('hover:bg-bg-3')
    expect(classOf(row)).toContain('group/row')
    for (const td of Array.from(row.querySelectorAll('td')).filter((t) =>
      classOf(t).includes('sticky'),
    )) {
      expect(classOf(td)).toContain('pinned-surface')
      expect(classOf(td), 'a frozen cell would not follow the row hover').toContain(
        'group-hover/row:bg-bg-3',
      )
    }
  })
})

describe('T5 the stale-row invariant still holds', () => {
  it('through a Reset', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    fireEvent.click(screen.getByTestId('columns-button'))
    fireEvent.click(screen.getByTestId('columns-reset'))
    const h = document.querySelectorAll('thead th').length
    const counts = Array.from(document.querySelectorAll('tbody tr'))
      .filter((tr) => tr.querySelectorAll('td').length > 1)
      .map((r) => r.querySelectorAll('td').length)
    const bad = counts.map((c, i) => (c === h ? null : `row ${i + 1}: ${c}`)).filter(Boolean)
    expect(bad, `header ${h}; disagreeing: ${bad.join(', ')}`).toEqual([])
  })
})

describe('T6 both themes', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('the row surface and the pinned edge resolve in both', () => {
    for (const t of ['--bg-2', '--bg-3', '--border-default']) {
      expect(css.includes(t + ':'), t + ' missing from :root').toBe(true)
      expect(light.includes(t + ':'), t + ' missing from light').toBe(true)
    }
    expect(css).toMatch(/\.pinned-edge\s*\{[^}]*box-shadow/)
    expect(css).toMatch(/:root\.light \.pinned-edge\s*\{[^}]*box-shadow/)
  })
})

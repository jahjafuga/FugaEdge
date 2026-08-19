// @vitest-environment jsdom
// v0.2.7 — a header is not a row.
//
// MEASURED: hovering anywhere on the header lit DATE and SYMBOL together as one
// block, and only those two — the exact pair that is pinned. Open and Close did
// nothing. Two cells lighting in unison while their neighbours stay put does not
// read as a hover; it reads as a selection of Date-and-Symbol.
//
// CAUSE: one helper builds the frozen cells for the header and the body, and the
// row hover was in the part they share. The header row also carried the group
// marker, so the hover had something to match. Everything else that helper emits —
// surface, offset, trailing edge — SHOULD be shared: that is what makes the frozen
// block continuous from the header to the last row. Only the hover must not be.

import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradesTable from '@/components/trades/TradesTable'
import { ALL_COLUMN_IDS, COLUMN_PREFS_KEY, PINNED_COLUMNS } from '@/lib/prefs/columns'
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
const classOf = (el: Element) => el.getAttribute('class') ?? ''
const allOn = () => {
  const v: Record<string, boolean> = {}
  for (const id of ALL_COLUMN_IDS) v[id] = true
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(v))
}
const headerCells = () => Array.from(document.querySelectorAll('thead th'))
const pinnedHeaderCells = () => headerCells().filter((e) => classOf(e).includes('sticky'))
const bodyRow = () =>
  Array.from(document.querySelectorAll('tbody tr')).find(
    (tr) => tr.querySelectorAll('td').length > 1,
  ) as HTMLElement

beforeEach(() => localStorage.clear())

describe('T1 no header cell declares the row hover', () => {
  it('not one of them, pinned or otherwise', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const offenders = headerCells()
      .filter((th) => classOf(th).includes('group-hover/row'))
      .map((th) => `"${th.textContent?.trim()}" → ${classOf(th)}`)
    expect(
      offenders,
      'these header cells follow the row hover:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('and the header row is not marked as a hover group at all', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const tr = document.querySelector('thead tr') as HTMLElement
    // Without the marker the hover has nothing to match even if one came back.
    expect(classOf(tr)).not.toContain('group/row')
    expect(classOf(tr)).not.toMatch(/(?:^|\s)hover:bg-/)
  })
})

describe('T2 hovering the header changes NO pinned header cell', () => {
  it('both pinned cells, not just the first', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const pinned = pinnedHeaderCells()
    // Date, Symbol, and the checkbox column when bulk is enabled.
    expect(pinned.length).toBeGreaterThanOrEqual(PINNED_COLUMNS.length)
    for (const th of pinned) {
      const hoverBg = classOf(th)
        .split(/\s+/)
        .filter((c) => /(?:^|:)hover(?:\/row)?:bg-/.test(c) || c.includes('group-hover/row:bg-'))
        .filter((c) => !c.includes('gold'))
      expect(
        hoverBg,
        `"${th.textContent?.trim()}" changes background on hover: ${classOf(th)}`,
      ).toEqual([])
    }
  })

  it('so the frozen pair cannot light as a block', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const labels = pinnedHeaderCells().map((th) => th.textContent?.trim())
    expect(labels).toContain('Date')
    expect(labels).toContain('Symbol')
    // Neither of the two the user saw move has any background hover left.
    for (const th of pinnedHeaderCells()) {
      expect(classOf(th)).not.toContain('bg-bg-3')
    }
  })

  it('the sortable ones keep their OWN affordance, which is a text colour', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const sortable = headerCells().filter((th) => classOf(th).includes('cursor-pointer'))
    expect(sortable.length).toBeGreaterThan(0)
    for (const th of sortable) {
      // Per cell, and not a surface change — so it can never read as a selection.
      expect(classOf(th)).toContain('hover:text-fg-primary')
      expect(classOf(th)).not.toMatch(/hover:bg-bg-/)
    }
  })
})

describe('T3 the body row hover still spans both halves', () => {
  it('unchanged — the row marks the group, the frozen cells follow it', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    const row = bodyRow()
    expect(classOf(row)).toContain('group/row')
    expect(classOf(row)).toContain('hover:bg-bg-3')
    const pinnedTds = Array.from(row.querySelectorAll('td')).filter((td) =>
      classOf(td).includes('sticky'),
    )
    expect(pinnedTds.length).toBeGreaterThan(0)
    for (const td of pinnedTds) {
      expect(classOf(td)).toContain('group-hover/row:bg-bg-3')
      expect(classOf(td)).toContain('pinned-surface')
    }
  })
})

describe('T4 the frozen edge is still emitted for the header', () => {
  it('one helper builds both, and only the hover is conditional', () => {
    const bar = src('src/components/trades/TradesTable.tsx')
    // Header passes false for hoverable, body true — everything else is shared.
    expect(bar).toMatch(/pinnedCell\(h\.column,[^)]*false\)/)
    expect(bar).toMatch(/pinnedCell\(cell\.column,[^)]*true\)/)
    expect(bar).toMatch(/const hover = hoverable \?/)
    // The edge is NOT behind that flag.
    const helper = bar.slice(bar.indexOf('function pinnedCell'), bar.indexOf('function pinnedCell') + 1400)
    expect(helper).toContain('pinned-edge')
    expect(helper).not.toMatch(/hoverable[\s\S]{0,80}pinned-edge/)
  })

  it('and the surface is shared too, so the block stays continuous', () => {
    allOn()
    render(<TradesTable {...PROPS} trades={TRADES} />)
    for (const th of pinnedHeaderCells()) expect(classOf(th)).toContain('pinned-surface')
    for (const td of Array.from(bodyRow().querySelectorAll('td')).filter((t) =>
      classOf(t).includes('sticky'),
    )) {
      expect(classOf(td)).toContain('pinned-surface')
    }
  })
})

describe('T5 both themes', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('the surface and edge classes resolve in both', () => {
    for (const c of ['pinned-surface', 'pinned-edge']) {
      expect(css).toContain('.' + c)
      expect(light, c + ' has no light-mode rule').toContain('.' + c)
    }
    for (const t of ['--bg-3', '--border-default']) {
      expect(css.includes(t + ':')).toBe(true)
      expect(light.includes(t + ':'), t + ' missing from light').toBe(true)
    }
  })
})

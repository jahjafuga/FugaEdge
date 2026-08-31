// @vitest-environment jsdom
//
// v0.2.7 -- AN ABSENCE IS NOT A RESULT. Reported by djsevans87.
//
// THE DEFECT. Most of PeriodMetrics is typed nullable, so a period with no
// trades yields null and its rows print a dash on their own. FIFTEEN fields
// are typed non-nullable -- net P&L, gross, fees, the four day counts, the
// four outcome counts, trading days, the two streaks and shares traded -- so
// an empty period yielded ZERO for them, and a zero subtracts. A period in
// which the trader did not trade at all was reporting MORE red days, MORE
// losers, MORE consecutive losses and MORE fees than one in which they did,
// in red, with an arrow.
//
// THE RULE. When one side has no trades: the surviving side keeps every
// number, the empty side shows a dash, no delta is computed, and no arrow or
// colour is rendered. A line names the empty period. When BOTH are empty the
// existing no-trades card is unchanged. When NEITHER is empty NOTHING
// changes, and the last of those is the guard that matters most.
//
// THE BANNER IT REPLACES said the empty period "will show that period as flat
// zero". That sentence described the defect. Nothing shows as flat zero now,
// so the sentence is gone rather than kept.

import { render, screen, within, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import CompareView from '../CompareView'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

// jsdom ships no ResizeObserver; recharts' ResponsiveContainer requires one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

afterEach(() => cleanup())

const MAY = { from: '2026-05-01', to: '2026-05-31' }
const APRIL = { from: '2026-04-01', to: '2026-04-30' }
const JUNE = { from: '2026-06-01', to: '2026-06-30' }

/** Four trades in May: two winners, two losers, net +250. */
function mayBook(): TradeListRow[] {
  return [
    makeTrade({ id: 1, date: '2026-05-04', symbol: 'AAA', net_pnl: 250, gross_pnl: 260, total_fees: 10, shares_bought: 100, shares_sold: 100 }),
    makeTrade({ id: 2, date: '2026-05-05', symbol: 'BBB', net_pnl: -80, gross_pnl: -72, total_fees: 8, shares_bought: 200, shares_sold: 200 }),
    makeTrade({ id: 3, date: '2026-05-11', symbol: 'CCC', net_pnl: 120, gross_pnl: 128, total_fees: 8, shares_bought: 150, shares_sold: 150 }),
    makeTrade({ id: 4, date: '2026-05-12', symbol: 'DDD', net_pnl: -40, gross_pnl: -33, total_fees: 7, shares_bought: 90, shares_sold: 90 }),
  ]
}

/** The same four, plus two in April so NEITHER side is empty. */
function bothBook(): TradeListRow[] {
  return [
    ...mayBook(),
    makeTrade({ id: 5, date: '2026-04-07', symbol: 'EEE', net_pnl: 60, gross_pnl: 66, total_fees: 6, shares_bought: 50, shares_sold: 50 }),
    makeTrade({ id: 6, date: '2026-04-08', symbol: 'FFF', net_pnl: -20, gross_pnl: -14, total_fees: 6, shares_bought: 70, shares_sold: 70 }),
  ]
}

function mount(trades: TradeListRow[], a = MAY, b = APRIL, filterSlot?: React.ReactNode) {
  return render(
    <CompareView
      trades={trades}
      sentimentByDate={new Map()}
      rangeA={a}
      rangeB={b}
      onRangeChange={() => {}}
      filterSlot={filterSlot}
    />,
  )
}

/** Every stat row on screen, as {label, values, delta, tone, hasArrow}. */
function statRows(c: HTMLElement) {
  return Array.from(c.querySelectorAll('div.grid.min-h-8')).map((r) => {
    const cells = Array.from(r.children).map((x) =>
      (x.textContent ?? '').replace(/\s+/g, ' ').trim())
    const d = r.children[r.children.length - 1] as HTMLElement
    return {
      label: cells[0],
      values: cells[1] ?? '',
      delta: cells[2] ?? '',
      tone: d.className.includes('text-win') ? 'win'
        : d.className.includes('text-loss') ? 'loss' : 'muted',
      hasArrow: d.querySelector('svg') != null,
    }
  })
}

const rowFor = (c: HTMLElement, label: string) =>
  statRows(c).find((r) => r.label.startsWith(label))

// --- ES1 -- THE DEFECT ------------------------------------------------------

describe('ES1 one side empty: every row dashes that side and computes nothing', () => {
  it('not one row carries a delta, an arrow or a colour', () => {
    const { container } = mount(mayBook())
    const rows = statRows(container)
    expect(rows.length, 'the fixture must render the stat block').toBeGreaterThan(40)
    const withDelta = rows.filter((r) => r.delta !== '—')
    const withArrow = rows.filter((r) => r.hasArrow)
    const withColour = rows.filter((r) => r.tone !== 'muted')
    expect(withDelta.map((r) => r.label), 'a delta survived against an empty period').toEqual([])
    expect(withArrow.map((r) => r.label), 'an arrow survived').toEqual([])
    expect(withColour.map((r) => r.label), 'a colour survived').toEqual([])
  })

  it('the four rows that used to read RED now read as a dash', () => {
    const { container } = mount(mayBook())
    for (const label of ['Red days', 'Losers', 'Max consec losses', 'Fees']) {
      const row = rowFor(container, label)
      expect(row, `${label} is missing from the block`).toBeTruthy()
      expect(row!.values.endsWith('—'), `${label} still shows a number on the empty side`).toBe(true)
      expect(row!.tone, `${label} is still coloured`).toBe('muted')
    }
  })

  it('and the SURVIVING side keeps every number it had', () => {
    const { container } = mount(mayBook())
    expect(rowFor(container, 'Net P&L')!.values).toBe('+$250.00vs—')
    expect(rowFor(container, 'Total trades')!.values).toBe('4vs—')
    expect(rowFor(container, 'Winners')!.values).toBe('2vs—')
    expect(rowFor(container, 'Fees')!.values).toBe('+$33.00vs—')
  })
})

// --- ES2 -- THE LINE --------------------------------------------------------

describe('ES2 the line names the empty period', () => {
  it('period B empty: the line names B and invites a new range', () => {
    const { container } = mount(mayBook(), MAY, APRIL)
    const line = container.querySelector('[data-compare-empty-side]')
    expect(line, 'no line rendered for the empty period').toBeTruthy()
    expect(line!.getAttribute('data-compare-empty-side')).toBe('B')
    const text = (line!.textContent ?? '').replace(/\s+/g, ' ').trim()
    expect(text).toContain('Period B has no trades in this range')
    expect(text).toContain('Pick a different range for Period B')
  })

  it('period A empty: the same line names A instead', () => {
    const { container } = mount(mayBook(), APRIL, MAY)
    const line = container.querySelector('[data-compare-empty-side]')
    expect(line!.getAttribute('data-compare-empty-side')).toBe('A')
    expect(line!.textContent).toContain('Period A has no trades in this range')
  })

  it('and it never says the trader lost, declined, fell or is down', () => {
    const { container } = mount(mayBook())
    const text = (container.querySelector('[data-compare-empty-side]')!.textContent ?? '').toLowerCase()
    for (const word of ['lost', 'decline', 'fell', 'down', 'worse']) {
      expect(text.includes(word), `the line says "${word}"`).toBe(false)
    }
  })

  it('the old banner that described the defect is gone', () => {
    mount(mayBook())
    expect(screen.queryByText(/will show that period as flat zero/)).toBeNull()
  })
})

// --- ES3 -- THE CONTROLS ----------------------------------------------------

describe('ES3 the cases that must NOT change', () => {
  it('NEITHER side empty: deltas, arrows and colours are all still there', () => {
    const { container } = mount(bothBook())
    const rows = statRows(container)
    expect(rows.filter((r) => r.delta !== '—').length,
      'the working case lost its deltas').toBeGreaterThan(10)
    expect(rows.filter((r) => r.hasArrow).length,
      'the working case lost its arrows').toBe(rows.length)
    expect(rows.filter((r) => r.tone !== 'muted').length,
      'the working case lost its colours').toBeGreaterThan(3)
    expect(container.querySelector('[data-compare-empty-side]'),
      'the empty-side line fired when both sides have trades').toBeNull()
  })

  it('NEITHER side empty: the numbers themselves are unchanged', () => {
    const { container } = mount(bothBook())
    expect(rowFor(container, 'Net P&L')!.values).toBe('+$250.00vs+$40.00')
    expect(rowFor(container, 'Total trades')!.values).toBe('4vs2')
  })

  it('BOTH sides empty: the existing no-trades card, unchanged', () => {
    const { container } = mount(mayBook(), JUNE, APRIL)
    expect(screen.getByText(/No trades in this period/)).toBeTruthy()
    expect(statRows(container).length, 'the stat block rendered for an empty pair').toBe(0)
  })
})

// --- ES4 -- THE FILTER SLOT -------------------------------------------------

describe('ES4 the caller filter control renders inside the periods card', () => {
  it('the slot is inside the card, not floating above it', () => {
    const { container } = mount(bothBook(), MAY, APRIL, <button type="button">Mistake</button>)
    const slot = container.querySelector('[data-compare-filter-slot]')
    expect(slot, 'the filter slot did not render').toBeTruthy()
    expect(within(slot as HTMLElement).getByText('Mistake')).toBeTruthy()
    const card = container.querySelector('.card-premium')
    expect(card!.contains(slot), 'the slot rendered outside the periods card').toBe(true)
  })

  it('a caller that passes no slot renders no slot at all', () => {
    const { container } = mount(bothBook())
    expect(container.querySelector('[data-compare-filter-slot]')).toBeNull()
  })
})

// --- ES5 -- PICKER VALIDATION -----------------------------------------------

describe('ES5 the ranges warn and never block', () => {
  it('overlapping periods warn, and the comparison still renders', () => {
    const { container } = mount(bothBook(), MAY, { from: '2026-05-10', to: '2026-06-10' })
    const w = container.querySelector('[data-compare-warning="overlap"]')
    expect(w, 'no overlap warning').toBeTruthy()
    expect(w!.textContent).toContain('overlap')
    expect(statRows(container).length, 'the comparison was blocked').toBeGreaterThan(40)
  })

  it('period B entirely after period A warns that the labels read backwards', () => {
    const { container } = mount(bothBook(), APRIL, MAY)
    const w = container.querySelector('[data-compare-warning="backwards"]')
    expect(w, 'no backwards warning').toBeTruthy()
    expect(w!.textContent).toContain('read backwards')
  })

  it('from later than to warns, and names the side', () => {
    const { container } = mount(bothBook(), { from: '2026-05-31', to: '2026-05-01' }, APRIL)
    const w = container.querySelector('[data-compare-warning="inverted"]')
    expect(w, 'no inverted warning').toBeTruthy()
    expect(w!.textContent).toContain('Period A starts after it ends')
  })

  it('two well ordered periods that do not touch warn about nothing', () => {
    const { container } = mount(bothBook(), MAY, APRIL)
    expect(container.querySelectorAll('[data-compare-warning]').length).toBe(0)
  })
})

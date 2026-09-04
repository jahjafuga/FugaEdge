// @vitest-environment jsdom
//
// BEAT 302 -- the strip can say "none of these".
//
// THE DEFECT (301's finding): the From and To date fields applied a range and
// never told the host, so the strip went on lighting a key that no longer
// described the window, and Overview's chart titles kept naming it too.
//
// THE SENTINEL: QuickSelection = QuickKey | 'custom'. It is a string, so
// Segment's type parameter accepts it; it matches no option, so Segment's
// equality predicate (Segment.tsx:17) leaves every key inactive without any
// edit to that shared component. QuickKey itself stays the closed five-member
// union of keys the strip renders, and rangeForQuickKey keeps taking QuickKey:
// the sentinel means NO KEY DESCRIBES THIS WINDOW, so nothing may translate it
// back into a range.
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import AnalyticsFilterBar, {
  quickKeyLabel,
  rangeForQuickKey,
  type QuickSelection,
} from '@/components/analytics/AnalyticsFilterBar'
import { emptyFilters } from '@/core/performance/filters'
import type { OverviewFilters } from '@/core/performance/types'
import { makeTrade } from '@/test/fixtures/trade'

const TRADES = [
  makeTrade({ id: 1, side: 'long', net_pnl: 10, date: '2026-08-01' }),
  makeTrade({ id: 2, side: 'short', net_pnl: -4, date: '2026-08-20' }),
]

/** A host that owns both halves, as OverviewTab and LongShortTab do. */
function Host({
  initialQuick = 'all',
  onQuick,
}: {
  initialQuick?: QuickSelection
  onQuick?: (q: QuickSelection) => void
}) {
  const [filters, setFilters] = useState<OverviewFilters>(() => emptyFilters())
  const [quick, setQuick] = useState<QuickSelection>(initialQuick)
  return (
    <AnalyticsFilterBar
      trades={TRADES}
      filters={filters}
      onFiltersChange={setFilters}
      quick={quick}
      onQuickChange={(q) => {
        onQuick?.(q)
        setQuick(q)
      }}
    />
  )
}

/** IDEMPOTENT: the expander toggles, so a helper that clicked every time
 *  closed the panel on its second call. It opens only when closed, read from
 *  the button's own aria-expanded. */
function openMore() {
  const btn = screen.getByRole('button', { name: /more filters/i })
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn)
}
const dateField = (label: RegExp) => {
  openMore()
  return screen.getByLabelText(label)
}

/** The range strip's Segment root, scoped by p-0.5 so the bar's FIELD
 *  skeleton (:97-98 shares every other class) cannot match. */
function stripKeys(): HTMLButtonElement[] {
  const roots = [...document.querySelectorAll('div.inline-flex.h-8.items-center.p-0\\.5')]
  for (const root of roots) {
    const keys = [...root.querySelectorAll('button')] as HTMLButtonElement[]
    if (keys.some((k) => /^(7D|30D|90D|YTD|ALL)$/.test(k.textContent ?? ''))) return keys
  }
  return []
}
const litKeys = () => stripKeys().filter((k) => k.className.includes('text-gold'))

afterEach(cleanup)

describe('G46 the date fields report that no key applies', () => {
  it('changing From reports the custom sentinel', () => {
    const seen = vi.fn()
    render(<Host initialQuick="30d" onQuick={seen} />)
    fireEvent.change(dateField(/^from$/i), { target: { value: '2026-08-10' } })
    expect(seen, 'the From field never told the host').toHaveBeenCalledWith('custom')
  })

  it('changing To reports it too', () => {
    const seen = vi.fn()
    render(<Host initialQuick="30d" onQuick={seen} />)
    fireEvent.change(dateField(/^to$/i), { target: { value: '2026-08-25' } })
    expect(seen, 'the To field never told the host').toHaveBeenCalledWith('custom')
  })
})

describe('G47 PIN: the sentinel lights nothing', () => {
  it('no key is active on custom, and exactly one on a real key', () => {
    render(<Host initialQuick="custom" />)
    expect(litKeys().length, 'a key lit while no key applies').toBe(0)
    expect(stripKeys().length, 'the strip did not render').toBeGreaterThan(0)
    cleanup()
    render(<Host initialQuick="30d" />)
    expect(litKeys().map((k) => k.textContent)).toEqual(['30D'])
  })
})

describe('G48 the label names the custom window', () => {
  it('custom reads Custom range, and the five keys are unchanged', () => {
    expect(quickKeyLabel('custom')).toBe('Custom range')
    // Recomputed from the pre-change quote (AnalyticsFilterBar.tsx:54-67).
    expect(quickKeyLabel('7d')).toBe('7 days')
    expect(quickKeyLabel('30d')).toBe('30 days')
    expect(quickKeyLabel('90d')).toBe('90 days')
    expect(quickKeyLabel('ytd')).toBe('YTD')
    expect(quickKeyLabel('all')).toBe('All time')
  })
})

describe('G49 the sentinel never becomes a range', () => {
  it('rangeForQuickKey rejects it at compile time', () => {
    // TYPE-LEVEL: the parameter stays QuickKey, so this line MUST be an
    // error. If someone widens it to QuickSelection the directive becomes
    // unused and tsc fails, which is exactly the alarm we want.
    // @ts-expect-error 'custom' is not a QuickKey, and must never become one
    expect(() => rangeForQuickKey('custom')).toBeTypeOf('function')
  })

  it('and no runtime path turns a custom report into a quick window', () => {
    const seen: QuickSelection[] = []
    render(<Host initialQuick="30d" onQuick={(q) => seen.push(q)} />)
    fireEvent.change(dateField(/^from$/i), { target: { value: '2026-08-10' } })
    expect(seen, 'the host was never told').toContain('custom')
    // The window on screen is the one the field set, not a key's window.
    expect((dateField(/^from$/i) as HTMLInputElement).value).toBe('2026-08-10')
    expect(litKeys().length, 'a key lit itself from the sentinel').toBe(0)
  })
})

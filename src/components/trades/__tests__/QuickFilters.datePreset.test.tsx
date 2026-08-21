// @vitest-environment jsdom
// v0.2.7 — A DATE PRESET IS NOT A DATE. The surface, end to end.
//
// The pure arithmetic is guarded in core/trades/__tests__/datePreset.test.ts.
// These are the guards that would have caught the shipped defect, and they run
// the real component against the real persistence layer across a real clock
// advance — because the defect only existed in the seam between them. Every
// piece was individually correct: the chip drew what it was told, the prefs
// blob returned what it was given, the filter matched the dates it got. What
// was wrong was that a PRESET had been flattened to two dates on the way in and
// there was nothing left to restore.

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuickFilters from '@/components/trades/QuickFilters'
import TradesFilters from '@/components/trades/TradesFilters'
import { readTradesFilters, writeTradesFilters, filterPrefsKey } from '@/lib/prefs/tradesFilters'
import { emptyFilters, isFiltering, type TradesFilterState } from '@/core/trades/tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'
import type { AccountScope } from '@shared/accounts-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

const ALL: AccountScope = 'all'
const MONDAY = new Date('2026-08-17T15:00:00')
const TUESDAY = new Date('2026-08-18T09:00:00')

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(MONDAY)
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

/** Mounts QuickFilters over a live state cell, the way the page does. */
function chips(initial: TradesFilterState = emptyFilters()) {
  let state = initial
  const ui = () => <QuickFilters filters={state} onChange={(n) => { state = n; r(ui()) }} />
  const { rerender: r } = render(ui())
  return {
    get state() { return state },
    click: (label: string) => fireEvent.click(screen.getByText(label)),
    lit: () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent),
  }
}

// ─── D6 — the defect itself ──────────────────────────────────────────────────

describe('D6 a preset set today is still that preset tomorrow', () => {
  for (const [label, expected] of [
    ['Today', { dateFrom: '2026-08-18', dateTo: '2026-08-18' }],
    ['Week', { dateFrom: '2026-08-12', dateTo: '2026-08-18' }],
    ['Month', { dateFrom: '2026-07-20', dateTo: '2026-08-18' }],
  ] as const) {
    it(`"${label}" survives the clock advancing a day — window AND chip`, () => {
      const monday = chips()
      monday.click(label)
      expect(monday.lit(), 'the chip did not light on the day it was clicked').toEqual([label])
      writeTradesFilters(ALL, monday.state)

      // A new day, a new mount, the same stored preference.
      vi.setSystemTime(TUESDAY)
      cleanup()
      const restored = readTradesFilters(ALL)
      const tuesday = chips(restored)

      expect(restored.dateFrom, `"${label}" restored a stale window`).toBe(expected.dateFrom)
      expect(restored.dateTo).toBe(expected.dateTo)
      expect(tuesday.lit(), `"${label}" restored dark — the user cannot see or clear it`).toEqual([label])
    })
  }

  it('and a MONTH later, which is where the old window was most wrong', () => {
    const h = chips()
    h.click('Month')
    writeTradesFilters(ALL, h.state)

    vi.setSystemTime(new Date('2026-09-17T15:00:00'))
    cleanup()
    const restored = readTradesFilters(ALL)
    expect(restored).toMatchObject({
      dateFrom: '2026-08-19',
      dateTo: '2026-09-17',
      datePreset: 'month',
    })
    expect(chips(restored).lit()).toEqual(['Month'])
  })

  it('exactly one date chip is ever lit at once', () => {
    const h = chips()
    h.click('Month')
    h.click('Week')
    expect(h.lit().filter((l) => ['Today', 'Week', 'Month'].includes(l ?? ''))).toEqual(['Week'])
  })
})

// ─── D7 — clicking a lit chip turns it off, completely ───────────────────────

describe('D7 turning a preset off leaves no residue', () => {
  it('the preset AND the window it derived both clear', () => {
    const h = chips()
    h.click('Week')
    expect(isFiltering(h.state)).toBe(true)

    h.click('Week')
    expect(h.lit()).toEqual([])
    expect(h.state.datePreset, 'the preset outlived the chip').toBeNull()
    expect(h.state.dateFrom, 'the window outlived the preset').toBe('')
    expect(h.state.dateTo).toBe('')
    expect(isFiltering(h.state), 'the page still believes it is filtering').toBe(false)
  })

  it('a cleared preset does not come back after a save and a new day', () => {
    const h = chips()
    h.click('Today')
    h.click('Today')
    writeTradesFilters(ALL, h.state)

    vi.setSystemTime(TUESDAY)
    const restored = readTradesFilters(ALL)
    expect(restored.datePreset).toBeNull()
    expect(restored.dateFrom).toBe('')
  })

  it('switching presets does not leave the old one filtering', () => {
    const h = chips()
    h.click('Month')
    h.click('Today')
    expect(h.state).toMatchObject({
      datePreset: 'today',
      dateFrom: '2026-08-17',
      dateTo: '2026-08-17',
    })
  })
})

// ─── D8 — the hand-picked range must beat the preset ─────────────────────────
//
// The sharp edge of the fix. If a preset is live and the user then picks a date
// by hand, the preset MUST stand down: otherwise the next mount re-derives it
// and silently overwrites the range they chose, which is a worse bug than the
// one being fixed here — it would throw away an explicit instruction.

describe('D8 picking a date by hand retires the preset', () => {
  function bar(initial: TradesFilterState) {
    let state = initial
    const ui = () => (
      <TradesFilters
        filters={state}
        onChange={(n) => { state = n; r(ui()) }}
        trades={[makeTrade({ id: 1, symbol: 'VEEE', net_pnl: 100 })]}
      />
    )
    const { rerender: r } = render(ui())
    return { get state() { return state } }
  }

  it('editing FROM clears the preset and keeps the typed date', () => {
    const h = chips()
    h.click('Week')
    const withPreset = h.state
    cleanup()

    const b = bar(withPreset)
    fireEvent.change(screen.getByLabelText('Date from'), { target: { value: '2026-01-01' } })
    expect(b.state.datePreset, 'a hand-picked date left the preset armed').toBeNull()
    expect(b.state.dateFrom).toBe('2026-01-01')
  })

  it('editing TO clears the preset too', () => {
    const h = chips()
    h.click('Week')
    const withPreset = h.state
    cleanup()

    const b = bar(withPreset)
    fireEvent.change(screen.getByLabelText('Date to'), { target: { value: '2026-01-31' } })
    expect(b.state.datePreset).toBeNull()
    expect(b.state.dateTo).toBe('2026-01-31')
  })

  it('and the hand-picked range then SURVIVES a day passing', () => {
    const h = chips()
    h.click('Week')
    const withPreset = h.state
    cleanup()

    const b = bar(withPreset)
    fireEvent.change(screen.getByLabelText('Date from'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Date to'), { target: { value: '2026-01-31' } })
    writeTradesFilters(ALL, b.state)

    vi.setSystemTime(TUESDAY)
    const restored = readTradesFilters(ALL)
    expect(restored.dateFrom, 'the clock overwrote an explicit choice').toBe('2026-01-01')
    expect(restored.dateTo).toBe('2026-01-31')
  })
})

// ─── D9 — the stored shape, forwards and backwards ───────────────────────────

describe('D9 the preference blob carries the preset without breaking older ones', () => {
  it('datePreset round-trips', () => {
    const h = chips()
    h.click('Week')
    writeTradesFilters(ALL, h.state)
    expect(readTradesFilters(ALL).datePreset).toBe('week')
  })

  it('a blob written BEFORE this field existed still restores its dates verbatim', () => {
    // Exactly what the shipped v1 writer produced: a flattened window, no intent.
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({
        v: 1,
        state: { symbol: 'TSLA', dateFrom: '2026-08-17', dateTo: '2026-08-17' },
      }),
    )
    vi.setSystemTime(TUESDAY)
    const back = readTradesFilters(ALL)
    expect(back.datePreset, 'an absent preset must not be invented').toBeNull()
    expect(back.dateFrom, 'an old blob had its dates rewritten').toBe('2026-08-17')
    expect(back.symbol).toBe('TSLA')
  })

  it('a garbage preset value is dropped, not trusted into the state', () => {
    localStorage.setItem(
      filterPrefsKey(ALL),
      JSON.stringify({ v: 1, state: { datePreset: 'decade', dateFrom: '2026-01-01' } }),
    )
    const back = readTradesFilters(ALL)
    expect(back.datePreset).toBeNull()
    expect(back.dateFrom).toBe('2026-01-01')
  })

  it('the bytes still settle — write(read(write(x))) is byte-identical', () => {
    const h = chips()
    h.click('Month')
    writeTradesFilters(ALL, h.state)
    const a = localStorage.getItem(filterPrefsKey(ALL))
    writeTradesFilters(ALL, readTradesFilters(ALL))
    expect(localStorage.getItem(filterPrefsKey(ALL))).toBe(a)
  })
})

// @vitest-environment jsdom
// v0.2.7 Feature 5 — THE DROPDOWN. T1..T4.
//
// The format panel was cut off at the card's edge. MEASURED, walking every
// ancestor from the panel to <body>, exactly one suspect property existed in the
// whole chain: `overflow-hidden` on CalendarHeader's card-premium box. Nothing
// had a transform, filter, opacity, will-change, contain, or a positioned
// z-index — .card-premium is background/border/radius/shadow and .card-accent is
// `@apply relative` at z-index auto, so neither is a stacking context.
//
// So it was CLIPPED, not painted under, and raising a number would not have
// helped. The panel leaves the box by the route AnalyticsFilterBar already took.
//
// T1 is written as a WALK, not as an assertion about one class, so the next
// ancestor that gains an overflow or a transform is caught wherever it appears.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CalendarMonth } from '@shared/calendar-types'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    chartSaveScreenshot: vi.fn(),
    accountsList: vi.fn(),
    cashBalanceGet: vi.fn(),
    settingsGet: vi.fn(),
  },
}))

import CalendarHeader from '../CalendarHeader'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { CALENDAR_CARD_FORMAT_IDS } from '@/lib/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

const m = vi.mocked(ipc)

const MONTH: CalendarMonth = {
  stats: {
    year: 2026, month: 8, net_pnl: 12.5, gross_pnl: 13, total_fees: 0.5,
    trade_count: 4, winners: 3, losers: 1, trading_days: 2,
  },
  days: [],
  range: { earliest: null, latest: null, monthsWithTrades: [] },
  weeks: [],
}

let rec: ReturnType<typeof installRecordingCanvas>
let restoreDecode: () => void

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // jsdom has no canvas; the compositor needs one to reach the save path at all.
  rec = installRecordingCanvas()
  restoreDecode = installImageDecode()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.accountsList.mockResolvedValue([])
  m.chartSaveScreenshot.mockResolvedValue({ canceled: true })
})
afterEach(() => {
  rec.restore()
  restoreDecode()
})

function mount() {
  return render(
    <AccountScopeProvider>
      <div className="space-y-5">
        <CalendarHeader
          month={MONTH}
          onPrev={() => {}}
          onNext={() => {}}
          onToday={() => {}}
          isCurrentMonth={false}
        />
      </div>
    </AccountScopeProvider>,
  )
}
const trigger = () => screen.getByTestId('card-format-button')
const panel = () => screen.queryByTestId('card-format-menu')

/** Every class that clips a descendant or traps it in a stacking context. */
const CLIPS = /^overflow(-[xy])?-(hidden|clip|auto|scroll)$/
const TRAPS = /^(transform|scale-|rotate-|translate-|filter$|blur-|backdrop-|opacity-|will-change-|contain-|isolate|perspective-|mix-blend-|mask-)/
/** A positioned element with a z-index is a stacking context. */
const POSITIONED = /^(relative|absolute|fixed|sticky)$/
const HAS_Z = /^z-(\[|\d)/

function ancestors(from: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.body) {
    out.push(el)
    el = el.parentElement
  }
  return out
}
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe('T1 the panel renders outside any clipping or trapping ancestor', () => {
  it('it is a direct child of <body>, not of the header card', async () => {
    mount()
    await userEvent.click(trigger())
    const p = panel()!
    expect(p.parentElement, 'the panel is still inside the header tree').toBe(document.body)
  })

  it('and NO ancestor of it clips or traps — walked, not assumed', async () => {
    mount()
    await userEvent.click(trigger())
    for (const el of ancestors(panel()!)) {
      const cls = classesOf(el)
      const clip = cls.filter((c) => CLIPS.test(c))
      const trap = cls.filter((c) => TRAPS.test(c))
      const ctx = cls.some((c) => POSITIONED.test(c)) && cls.some((c) => HAS_Z.test(c))
      expect(clip, `<${el.tagName}> clips the panel: ${clip.join(' ')}`).toEqual([])
      expect(trap, `<${el.tagName}> traps the panel: ${trap.join(' ')}`).toEqual([])
      expect(ctx, `<${el.tagName}> is a stacking context`).toBe(false)
    }
  })

  it('the header card DOES clip — which is why the panel had to leave it', () => {
    // Names the cause rather than trusting the fix: if this ever stops being
    // true, the portal is no longer load-bearing and someone should know.
    mount()
    const card = ancestors(trigger()).find((el) => classesOf(el).includes('card-premium'))
    expect(card, 'the header is no longer a card-premium box').toBeTruthy()
    expect(classesOf(card!)).toContain('overflow-hidden')
  })

  it('and the TRIGGER is still inside it — only the panel left', async () => {
    mount()
    await userEvent.click(trigger())
    expect(
      ancestors(trigger()).some((el) => classesOf(el).includes('overflow-hidden')),
    ).toBe(true)
  })
})

describe('T2 its z-index exceeds every stacking context in the chain', () => {
  const zOf = (el: Element): number | null => {
    const c = classesOf(el).find((x) => HAS_Z.test(x))
    if (!c) return null
    const m2 = c.match(/^z-\[(\d+)\]$/) ?? c.match(/^z-(\d+)$/)
    return m2 ? Number(m2[1]) : null
  }

  it('the panel out-ranks every z-index found on the way to the trigger', async () => {
    mount()
    await userEvent.click(trigger())
    const panelZ = zOf(panel()!)
    expect(panelZ, 'the panel has no z-index').not.toBeNull()
    const found = ancestors(trigger())
      .map(zOf)
      .filter((z): z is number => z != null)
    for (const z of found) {
      expect(panelZ!, `an ancestor sits at ${z}`).toBeGreaterThan(z)
    }
  })

  it('the backdrop clears the TopBar and the panel clears the backdrop', async () => {
    // The app's OWN measured scale, from the AnalyticsFilterBar fix: TopBar 40,
    // modals 50, activation 60, toasts 110/210. Asserted against those, not
    // against a literal chosen here.
    mount()
    await userEvent.click(trigger())
    const TOPBAR = 40
    const MODAL = 50
    const backZ = zOf(screen.getByTestId('card-format-backdrop'))!
    const panelZ = zOf(panel()!)!
    expect(backZ).toBeGreaterThan(TOPBAR)
    expect(panelZ).toBeGreaterThan(backZ)
    expect(panelZ).toBeLessThan(MODAL)
  })

  it('and it is positioned against the viewport, so no ancestor box can crop it', async () => {
    mount()
    await userEvent.click(trigger())
    expect(classesOf(panel()!)).toContain('fixed')
    expect(panel()!.style.top).not.toBe('')
    expect(panel()!.style.left).not.toBe('')
  })
})

describe('T3 all four formats are selectable end to end, through the real menu', () => {
  for (const f of CALENDAR_CARD_FORMAT_IDS) {
    it(`${f} can be chosen and is what gets exported`, async () => {
      mount()
      await userEvent.click(trigger())
      const byLabel = screen
        .getAllByRole('menuitemradio')
        .find((b) => b.textContent?.toLowerCase().startsWith(f))!
      await userEvent.click(byLabel)
      await waitFor(() => expect(panel()).toBeNull())
      expect(localStorage.getItem('calendar.shareFormat')).toBe(f)

      await userEvent.click(screen.getByRole('button', { name: /card/i }))
      await waitFor(() => expect(m.chartSaveScreenshot).toHaveBeenCalled())
      expect(m.chartSaveScreenshot.mock.calls[0][0].suggestedName).toBe(
        `fugaedge-calendar-2026-08-${f}.png`,
      )
    })
  }

  it('the trigger shows what is chosen', async () => {
    mount()
    await userEvent.click(trigger())
    await userEvent.click(
      screen.getAllByRole('menuitemradio').find((b) => b.textContent?.startsWith('Story'))!,
    )
    expect(trigger().textContent).toContain('Story')
  })
})

describe('T7 the menu items wear the same treatment as the CARD button', () => {
  // They were the last bare-text controls in a row where everything else is a
  // pressable object with its own border and surface.
  it('each item resolves the shared control strings, not a local style', async () => {
    mount()
    await userEvent.click(trigger())
    for (const item of screen.getAllByRole('menuitemradio')) {
      const cls = classesOf(item)
      // the skeleton every control in that row shares
      expect(cls, `${item.textContent}`).toEqual(
        expect.arrayContaining(['inline-flex', 'rounded-md', 'border', 'cursor-pointer']),
      )
      expect(cls.some((c) => c.startsWith('transition-colors'))).toBe(true)
    }
  })

  it('the chosen one takes the row’s ACTIVE treatment, the rest the idle one', async () => {
    localStorage.setItem('calendar.shareFormat', 'story')
    mount()
    await userEvent.click(trigger())
    const items = screen.getAllByRole('menuitemradio')
    const chosen = items.find((b) => b.getAttribute('aria-checked') === 'true')!
    const others = items.filter((b) => b !== chosen)
    expect(classesOf(chosen)).toEqual(expect.arrayContaining(['border-gold', 'bg-gold']))
    for (const o of others) {
      expect(classesOf(o)).toEqual(expect.arrayContaining(['border-border-subtle', 'bg-bg-2']))
    }
  })

  it('and the strings come from the same module the trigger reads', () => {
    const SRC = readFileSync(
      resolve(process.cwd(), 'src/components/calendar/CalendarShareControl.tsx'),
      'utf8',
    )
    expect(SRC).toContain("from '@/components/trades/viewControlClasses'")
    expect(SRC).toMatch(/format === f \? viewControlOn : viewControlIdle/)
    // the item's own hand-rolled active style is gone (the %/$ segmented pill
    // keeps its own, which is a different control and was not in scope)
    expect(SRC).not.toMatch(/menuitemradio[\s\S]{0,600}?bg-gold\/\[0\.14\]/)
  })

  it('the CARD button and an item share their skeleton', async () => {
    mount()
    await userEvent.click(trigger())
    const item = screen.getAllByRole('menuitemradio')[0]
    const shared = ['inline-flex', 'rounded-md', 'border', 'cursor-pointer']
    for (const c of shared) {
      expect(classesOf(trigger()), `trigger lacks ${c}`).toContain(c)
      expect(classesOf(item), `item lacks ${c}`).toContain(c)
    }
  })
})

describe('T4 clicking outside closes it', () => {
  it('the backdrop dismisses', async () => {
    mount()
    await userEvent.click(trigger())
    expect(panel()).toBeTruthy()
    fireEvent.click(screen.getByTestId('card-format-backdrop'))
    await waitFor(() => expect(panel()).toBeNull())
  })

  it('the backdrop covers the whole viewport, so anywhere counts', async () => {
    mount()
    await userEvent.click(trigger())
    expect(classesOf(screen.getByTestId('card-format-backdrop'))).toEqual(
      expect.arrayContaining(['fixed', 'inset-0']),
    )
  })

  it('and the trigger toggles it shut again', async () => {
    mount()
    await userEvent.click(trigger())
    expect(panel()).toBeTruthy()
    await userEvent.click(trigger())
    await waitFor(() => expect(panel()).toBeNull())
  })

  it('nothing is left behind on <body> once closed', async () => {
    mount()
    await userEvent.click(trigger())
    fireEvent.click(screen.getByTestId('card-format-backdrop'))
    await waitFor(() => expect(panel()).toBeNull())
    expect(screen.queryByTestId('card-format-backdrop')).toBeNull()
  })
})

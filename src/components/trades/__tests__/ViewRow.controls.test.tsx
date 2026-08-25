// @vitest-environment jsdom
// v0.2.7 — the four view-row controls become pressable objects.
//
// Table / Charts / Grid were bare text inside one bordered container, so only the
// group read as an object and the individual segments read as labels. Columns
// beside them was a fifth style again. And an inactive segment's hover tinted
// gold, which is the same signal the SELECTED segment uses — so while the cursor
// moved across the group you could not tell which view was actually on.
//
// All four now share one metric, lifted from the most finished button in the app
// (PRINT REPORT on the Analytics page): h-8, rounded-md, border-border-subtle,
// bg-bg-2, transition-colors at 150ms. Its gold hover is the one thing NOT taken —
// hover lifts a step up the surface scale, gold selects.

import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import TradesViewToggle from '@/components/trades/TradesViewToggle'
import ColumnsMenu from '@/components/trades/ColumnsMenu'
import {
  VIEW_CONTROL_ACTIVE,
  VIEW_CONTROL_BASE,
  VIEW_CONTROL_FOCUS,
  VIEW_CONTROL_INACTIVE,
} from '@/components/trades/viewControlClasses'

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const classOf = (el: Element) => el.getAttribute('class') ?? ''
const tokens = (el: Element) => classOf(el).split(/\s+/).filter(Boolean)

/** All four controls, rendered together the way the page renders them. */
function renderRow() {
  render(
    <div className="flex items-center gap-3">
      <TradesViewToggle value="table" onChange={() => {}} />
      <ColumnsMenu visibility={{}} onChange={() => {}} />
    </div>,
  )
  const segments = Array.from(document.querySelectorAll('[role="tab"]'))
  const trigger = screen.getByTestId('columns-button')
  return { segments, trigger, all: [...segments, trigger] }
}

const pick = (el: Element, re: RegExp) => tokens(el).filter((c) => re.test(c)).sort()

describe('T1 all four share one height, radius and border token', () => {
  it('the metric is identical across the row', () => {
    const { all } = renderRow()
    expect(all).toHaveLength(4)
    const shape = (el: Element) => ({
      height: pick(el, /^h-\d+$/),
      radius: pick(el, /^rounded/),
      border: pick(el, /^border-(border-|gold)/),
      transition: pick(el, /^(transition|duration|ease)-/),
    })
    const first = shape(all[0])
    for (const el of all) {
      const s = shape(el)
      expect(s.height, 'height differs: ' + classOf(el)).toEqual(first.height)
      expect(s.radius, 'radius differs: ' + classOf(el)).toEqual(first.radius)
      expect(s.transition, 'transition differs: ' + classOf(el)).toEqual(first.transition)
      // border TOKEN differs only for the selected one, which is gold by design.
      expect(s.border.length, 'no border token: ' + classOf(el)).toBeGreaterThan(0)
    }
    expect(first.height).toEqual(['h-8'])
    expect(first.radius).toEqual(['rounded-md'])
  })

  it('and they share it by construction, not by coincidence', () => {
    // One string, imported by both components — they cannot drift apart.
    expect(src('src/components/trades/TradesViewToggle.tsx')).toContain('viewControlClasses')
    // Via ui/ToggleMenu, which is where the chooser's trigger now lives.
    expect(src('src/components/ui/ToggleMenu.tsx')).toContain('viewControlClasses')
    expect(VIEW_CONTROL_BASE).toContain('h-8')
    expect(VIEW_CONTROL_BASE).toContain('rounded-md')
  })
})

describe('T2 no inactive control declares gold, at rest or on hover', () => {
  it('the three unselected controls are gold-free', () => {
    const { all } = renderRow()
    const inactive = all.filter((el) => el.getAttribute('aria-selected') !== 'true')
    expect(inactive).toHaveLength(3) // Charts, Grid, Columns
    for (const el of inactive) {
      const gold = tokens(el).filter((c) => c.includes('gold') && !c.startsWith('focus-visible:'))
      expect(
        gold,
        'an unselected control uses gold, which is the selected signal: ' + classOf(el),
      ).toEqual([])
    }
  })

  it('the hover is a surface step, not a tint', () => {
    expect(VIEW_CONTROL_INACTIVE).toContain('hover:bg-bg-3')
    expect(VIEW_CONTROL_INACTIVE).toContain('hover:text-fg-primary')
    expect(VIEW_CONTROL_INACTIVE).not.toContain('gold')
  })

  it('which is the one thing NOT taken from the reference button', () => {
    // PRINT REPORT hovers gold. Correct there, wrong in a row where gold selects.
    const analytics = src('src/pages/Analytics.tsx')
    expect(analytics).toContain('hover:border-gold/40')
  })
})

describe('T3 exactly one control is active, and it is the gold one', () => {
  it('one segment declares gold at rest', () => {
    const { all } = renderRow()
    const goldish = all.filter((el) =>
      tokens(el).some((c) => c === 'bg-gold' || c === 'border-gold'),
    )
    expect(goldish).toHaveLength(1)
    expect(goldish[0].getAttribute('aria-selected')).toBe('true')
    expect(goldish[0].textContent).toContain('Table')
  })

  it('and the active style is legible against a dark fill', () => {
    expect(VIEW_CONTROL_ACTIVE).toContain('bg-gold')
    expect(VIEW_CONTROL_ACTIVE).toContain('text-accent-ink')
  })
})

describe('T4 every control declares a hover treatment', () => {
  it('all four', () => {
    const { all } = renderRow()
    for (const el of all) {
      const hover = tokens(el).filter((c) => c.startsWith('hover:'))
      const isActive = el.getAttribute('aria-selected') === 'true'
      // The selected one is already at its terminal state; the other three lift.
      if (!isActive) {
        expect(hover.length, 'no hover: ' + classOf(el)).toBeGreaterThan(0)
      }
    }
  })
})

describe('T5 every control declares a focus treatment', () => {
  it('all four carry the ring', () => {
    const { all } = renderRow()
    for (const el of all) {
      const focus = tokens(el).filter((c) => c.startsWith('focus-visible:'))
      expect(focus.length, 'no focus treatment: ' + classOf(el)).toBeGreaterThan(0)
      expect(classOf(el)).toContain('focus-visible:shadow-glow-gold')
    }
  })

  it('and it uses a token the config already declared', () => {
    const cfg = src('tailwind.config.ts')
    expect(cfg).toContain("'glow-gold'")
    expect(VIEW_CONTROL_FOCUS).toContain('shadow-glow-gold')
  })
})

describe('T6 COLUMNS is outside the tablist and keeps its chevron', () => {
  it('it is not a fourth view', () => {
    const { trigger } = renderRow()
    const tablist = document.querySelector('[role="tablist"]') as HTMLElement
    expect(tablist.contains(trigger)).toBe(false)
    expect(trigger.getAttribute('role')).not.toBe('tab')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('and still says it opens something', () => {
    const { trigger } = renderRow()
    expect(trigger.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2)
  })
})

describe('T7 both themes', () => {
  const css = src('src/index.css')
  const light = css.slice(css.indexOf(':root.light'))

  it('every token the row paints resolves in light too', () => {
    for (const t of ['--bg-2', '--bg-3', '--border-subtle', '--gold']) {
      expect(css.includes(t + ':'), t + ' missing from :root').toBe(true)
      expect(light.includes(t + ':'), t + ' missing from light').toBe(true)
    }
  })

  it('and nothing in the row is a raw colour', () => {
    for (const f of [
      'src/components/trades/viewControlClasses.ts',
      'src/components/trades/TradesViewToggle.tsx',
      'src/components/trades/ColumnsMenu.tsx',
    ]) {
      expect(src(f)).not.toMatch(/bg-\[#/)
      expect(src(f)).not.toMatch(/text-\[#/)
    }
  })
})

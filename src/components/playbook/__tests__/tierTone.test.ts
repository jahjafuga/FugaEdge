// Tier palette — the medal scheme (djsevans87, 2026-07-05). tierTone() is the single
// source of the graded chip colour, shared by TierBadge and the Setup-editor tier picker
// so they can never drift. A+ gold · A silver · B bronze(copper) · C amber. The hue carries
// the grade; alpha steps down A+ (strongest) → C (softest).
//
// The load-bearing test is the ANTI-GRIFTER GUARD below: no tier may borrow a colour
// pnlClass paints money in. Green (--win) and red (--loss) are reserved for profit/loss — a
// grade wearing one would read as a dollar sign. A=silver removed the last such borrow (A
// used to be text-win, the profit token); this guard stops any tier reintroducing one.

import { describe, expect, it } from 'vitest'
import { PLAYBOOK_TIERS } from '@shared/playbook-types'
import { tierTone } from '../tierTone'
import { pnlClass } from '@/lib/format'

// The colour FAMILIES pnlClass renders money in — derived, not hard-coded, so this guard
// tracks pnlClass: pnlClass(1) -> 'text-win', pnlClass(-1) -> 'text-loss'. If profit/loss
// are ever repointed at a new token, the guard re-derives and still bites. The neutral
// zero case (text-fg-tertiary) is deliberately excluded — it is the No-Setup grey, not a
// P&L hue a tier must avoid.
const PNL_FAMILIES = [pnlClass(1), pnlClass(-1)].map((t) => t.replace(/^text-/, ''))

describe('tierTone — anti-grifter guard: green/red are money, never grades', () => {
  it('no tier borrows a P&L colour (win/loss) in ANY slot — border, bg, or text', () => {
    expect(PNL_FAMILIES).toEqual(['win', 'loss']) // pin what we are guarding against
    for (const tier of PLAYBOOK_TIERS) {
      const tone = tierTone(tier)
      for (const family of PNL_FAMILIES) {
        // matches border-win/50, bg-win/[0.12], text-win, border-loss/40, ...
        expect(
          tone,
          `tier ${tier} must not wear the P&L colour "${family}"`,
        ).not.toMatch(new RegExp(`(?:border|bg|text)-${family}\\b`))
      }
    }
  })
})

describe('tierTone — the medal scheme', () => {
  it('A+ → gold (unchanged)', () => {
    expect(tierTone('A+')).toContain('gold')
  })

  it('A → silver (was win-green — the anti-grifter fix)', () => {
    expect(tierTone('A')).toContain('silver')
    expect(tierTone('A')).not.toContain('win')
  })

  it('B → bronze/copper (was teal — breaks the A/B green blur)', () => {
    expect(tierTone('B')).toContain('copper')
    expect(tierTone('B')).not.toContain('accent-teal')
  })

  it('C → amber tier-c (unchanged — NOT red, stays off --loss)', () => {
    expect(tierTone('C')).toContain('tier-c')
    expect(tierTone('C')).not.toContain('loss')
  })

  it('A and B are DISTINCT (the regression: silver vs copper, not two greens)', () => {
    expect(tierTone('A')).not.toBe(tierTone('B'))
    expect(tierTone('A')).toContain('silver')
    expect(tierTone('A')).not.toContain('copper')
    expect(tierTone('B')).toContain('copper')
    expect(tierTone('B')).not.toContain('silver')
  })
})

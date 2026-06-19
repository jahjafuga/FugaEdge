// Tier palette re-tone (v0.2.5) — tierTone() is the single source of the graded
// chip colour, shared by TierBadge and the Setup-editor tier picker so they can
// never drift again. The re-tone frees RED for P&L (C off --loss) and GREY for
// the No-Setup chip (B off the neutral fallthrough): A+ gold · A green · B teal
// · C amber.

import { describe, expect, it } from 'vitest'
import { tierTone } from '../tierTone'

describe('tierTone — graded chip tone per tier (v0.2.5 re-tone)', () => {
  it('A+ → gold', () => {
    expect(tierTone('A+')).toContain('gold')
  })

  it('A → win green', () => {
    expect(tierTone('A')).toContain('win')
  })

  it('B → teal — the re-tone: no longer neutral grey', () => {
    expect(tierTone('B')).toContain('accent-teal')
    expect(tierTone('B')).not.toContain('bg-3')
    expect(tierTone('B')).not.toContain('border-strong')
  })

  it('C → amber tier-c — the re-tone: no longer loss red', () => {
    expect(tierTone('C')).toContain('tier-c')
    expect(tierTone('C')).not.toContain('loss')
  })
})

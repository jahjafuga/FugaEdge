// Idea 1 PART A — pure Route-A classification of a trade's PRIMARY setup into
// graded / no-setup / untagged. Sibling of signalBuckets.ts / tiers.ts; the
// "With a setup vs No setup" comparison partitions trades through this.

import { describe, expect, it } from 'vitest'
import type { PlaybookTier } from '@shared/playbook-types'
import { primaryState } from '../primaryState'

// Minimal row — primaryState reads only the two primary fields.
const row = (playbook_id: number | null, playbook_tier: PlaybookTier | null) => ({
  playbook_id,
  playbook_tier,
})

describe('primaryState — Route-A primary classification', () => {
  it('graded primary (id set, real tier) → "graded"', () => {
    expect(primaryState(row(7, 'A+'))).toBe('graded')
    expect(primaryState(row(3, 'B'))).toBe('graded')
  })

  it('system No-Setup primary (id set, tier nulled by Route A) → "no-setup"', () => {
    expect(primaryState(row(99, null))).toBe('no-setup')
  })

  it('untagged (no primary, id null) → "untagged"', () => {
    expect(primaryState(row(null, null))).toBe('untagged')
  })

  it('structurally-unreachable (id null but tier set) → "untagged" (id null dominates)', () => {
    expect(primaryState(row(null, 'A'))).toBe('untagged')
  })

  it('classifies a mix of real-shaped rows', () => {
    const rows = [row(1, 'A+'), row(2, null), row(null, null), row(5, 'C')]
    expect(rows.map(primaryState)).toEqual(['graded', 'no-setup', 'untagged', 'graded'])
  })
})

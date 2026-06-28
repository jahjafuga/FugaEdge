import { describe, it, expect } from 'vitest'
import type { PlaybookTier } from '@shared/playbook-types'
import { tierRank } from '../tierRank'

// Trade-shaped fixtures: only the two fields the comparator reads. No Setup and
// Untagged are BOTH playbook_tier === null — the playbook_id is what splits them
// (No Setup has a system primary id; Untagged has none).
type Row = { playbook_id: number | null; playbook_tier: PlaybookTier | null }
const noSetup: Row = { playbook_id: 1, playbook_tier: null }
const untagged: Row = { playbook_id: null, playbook_tier: null }
const graded = (tier: PlaybookTier): Row => ({ playbook_id: 2, playbook_tier: tier })

describe('tierRank', () => {
  it('ranks No Setup at 0 (leads, worst discipline)', () => {
    expect(tierRank(noSetup)).toBe(0)
  })

  it('ranks Untagged at 5 (trails, no plan recorded)', () => {
    expect(tierRank(untagged)).toBe(5)
  })

  it('ranks graded tiers C<B<A<A+ (1..4)', () => {
    expect(tierRank(graded('C'))).toBe(1)
    expect(tierRank(graded('B'))).toBe(2)
    expect(tierRank(graded('A'))).toBe(3)
    expect(tierRank(graded('A+'))).toBe(4)
  })

  it('sorts a list ascending into [No Setup, C, B, A, A+, Untagged]', () => {
    // Deliberately shuffled input.
    const rows: { label: string; row: Row }[] = [
      { label: 'A+', row: graded('A+') },
      { label: 'Untagged', row: untagged },
      { label: 'C', row: graded('C') },
      { label: 'No Setup', row: noSetup },
      { label: 'A', row: graded('A') },
      { label: 'B', row: graded('B') },
    ]
    const order = [...rows]
      .sort((a, b) => tierRank(a.row) - tierRank(b.row))
      .map((r) => r.label)
    expect(order).toEqual(['No Setup', 'C', 'B', 'A', 'A+', 'Untagged'])
  })

  it('gives equal ranks for the same tier (ties handled by the table)', () => {
    expect(tierRank(graded('A'))).toBe(tierRank(graded('A')))
  })
})

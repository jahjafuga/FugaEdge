import { describe, it, expect } from 'vitest'
import { pickMainChallenge } from '../mainChallenge'
import type { GoalWithProgress } from '@shared/identity-types'

// Pure selector for the dashboard's "main challenge": from active equity goals
// (passed in newest-first, as listGoals returns them), pick the highest target;
// ties keep the first (newest). Goals whose progress failed to parse are skipped.

let n = 0
function mk(
  target: number,
  opts: { nullProgress?: boolean } = {},
): GoalWithProgress {
  n += 1
  return {
    id: `g${n}`,
    title: `Goal ${n}`,
    kind: 'equity',
    config_json: '{}',
    preset_id: null,
    status: 'active',
    created_at: `2026-06-${String(n).padStart(2, '0')}T00:00:00.000Z`,
    completed_at: null,
    progress: opts.nullProgress ? null : { current: 0, target, fraction: 0 },
  }
}

describe('pickMainChallenge', () => {
  it('returns null for an empty list', () => {
    expect(pickMainChallenge([])).toBeNull()
  })

  it('returns the only goal', () => {
    const g = mk(50_000)
    expect(pickMainChallenge([g])).toBe(g)
  })

  it('picks the highest target (order-independent)', () => {
    const low = mk(10_000)
    const high = mk(1_000_000)
    expect(pickMainChallenge([low, high])).toBe(high)
    expect(pickMainChallenge([high, low])).toBe(high)
  })

  it('on a target tie keeps the first (newest-first input)', () => {
    const newer = mk(1_000_000)
    const older = mk(1_000_000)
    expect(pickMainChallenge([newer, older])).toBe(newer)
  })

  it('skips goals whose progress is null', () => {
    const broken = mk(5_000_000, { nullProgress: true })
    const valid = mk(1_000_000)
    expect(pickMainChallenge([broken, valid])).toBe(valid)
  })

  it('returns null when every goal has null progress', () => {
    expect(pickMainChallenge([mk(1_000_000, { nullProgress: true })])).toBeNull()
  })
})

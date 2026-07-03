// Beat 3.5 round 2 — the flow-strip derivation: Starting (amount + date),
// Deposits total, Withdrawals total from an account's cash events.
// Renderer-side reduce over the EXISTING beat-2 channel's rows; transfer
// legs count as their plain kinds (they ARE deposits/withdrawals to this
// account); signs are carried by labels, never color.

import { describe, it, expect } from 'vitest'
import type { CashEvent } from '@shared/cash-types'
import { deriveFlowStats } from '../cashFlow'

function ev(over: Partial<CashEvent>): CashEvent {
  return {
    id: 'EV',
    account_id: 'MAIN',
    kind: 'deposit',
    amount: 0,
    date: '2026-06-01',
    note: null,
    transfer_id: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...over,
  }
}

describe('deriveFlowStats', () => {
  it('sums deposits and withdrawals INCLUDING transfer legs; starting carries amount + date', () => {
    const stats = deriveFlowStats([
      ev({ id: 'S', kind: 'starting', amount: 1000, date: '2026-05-01' }),
      ev({ id: 'D1', kind: 'deposit', amount: 500 }),
      ev({ id: 'D2', kind: 'deposit', amount: 300, transfer_id: 'T-1' }),
      ev({ id: 'W1', kind: 'withdrawal', amount: 200, transfer_id: 'T-2' }),
    ])
    expect(stats.starting).toEqual({ amount: 1000, date: '2026-05-01' })
    expect(stats.deposits).toBe(800)
    expect(stats.withdrawals).toBe(200)
  })

  it('a zero-flow account: starting only, both totals 0', () => {
    const stats = deriveFlowStats([
      ev({ id: 'S', kind: 'starting', amount: 5000, date: '2026-07-03' }),
    ])
    expect(stats.starting).toEqual({ amount: 5000, date: '2026-07-03' })
    expect(stats.deposits).toBe(0)
    expect(stats.withdrawals).toBe(0)
  })

  it('no starting row -> starting null (the un-anchored account)', () => {
    const stats = deriveFlowStats([ev({ id: 'D1', kind: 'deposit', amount: 50 })])
    expect(stats.starting).toBeNull()
    expect(stats.deposits).toBe(50)
  })
})

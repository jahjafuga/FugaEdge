// Beat 3.5 round 2 — the flow-strip derivation: Starting (amount + date),
// Deposits total, Withdrawals total from one account's cash events (the
// existing beat-2 channel's rows). Transfer legs count as their plain
// kinds — they ARE deposits/withdrawals to this account. Presentation
// math (src/lib); signs are carried by labels, never color.

import type { CashEvent } from '@shared/cash-types'

export interface FlowStats {
  starting: { amount: number; date: string } | null
  deposits: number
  withdrawals: number
}

export function deriveFlowStats(events: CashEvent[]): FlowStats {
  let starting: FlowStats['starting'] = null
  let deposits = 0
  let withdrawals = 0
  for (const ev of events) {
    if (ev.kind === 'starting') starting = { amount: ev.amount, date: ev.date }
    else if (ev.kind === 'deposit') deposits += ev.amount
    else if (ev.kind === 'withdrawal') withdrawals += ev.amount
  }
  return { starting, deposits, withdrawals }
}

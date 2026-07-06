// DAS/fill precise-column capture (Beat B2a). Unlike Ocean One (whose money
// arrives as a 2dp display string), the fill path already holds full precision
// in memory: proceedsSold - costBought (gross) and feeSum (fees) are computed
// pre-round at build-round-trips.ts:223-224. B2a records those into
// gross_pnl_precise / total_fees_precise so Beat B3 can sum without
// round-then-sum drift, while the 2dp gross_pnl / total_fees are unchanged.

import { describe, it, expect } from 'vitest'
import { buildRoundTrips } from '../build-round-trips'
import type { Execution } from '@shared/import-types'

let idc = 0
function exec(o: {
  symbol: string; side: 'B' | 'S'; qty: number; price: number; time: string; commission?: number
}): Execution {
  idc += 1
  return {
    trade_id: `T${idc}`, order_id: `O${idc}`, is_short: o.side === 'S', date: o.time.slice(0, 10),
    symbol: o.symbol, side: o.side, qty: o.qty, price: o.price, time: o.time, commission: o.commission,
  }
}

interface PreciseTrip {
  gross_pnl: number; total_fees: number; gross_pnl_precise: number; total_fees_precise: number
}

describe('buildRoundTrips — Beat B2a captures full-precision gross + fees', () => {
  it('records gross_pnl_precise = proceedsSold-costBought and total_fees_precise = feeSum, pre-round', () => {
    idc = 0
    // Buy 100 @ 10.00, Sell 100 @ 10.12347 -> gross 12.347 (display 12.35);
    // commission 0.1234 (display 0.12). Both carry a sub-penny tail.
    const built = buildRoundTrips([
      exec({ symbol: 'DAST', side: 'B', qty: 100, price: 10.0, time: '2026-05-15T09:30:00', commission: 0.1234 }),
      exec({ symbol: 'DAST', side: 'S', qty: 100, price: 10.12347, time: '2026-05-15T09:31:00' }),
    ]) as unknown as PreciseTrip[]
    const t = built[0]
    // 2dp display — unchanged from pre-B2a
    expect(t.gross_pnl).toBeCloseTo(12.35, 2)
    expect(t.total_fees).toBeCloseTo(0.12, 2)
    // full precision — the pre-round values
    expect(t.gross_pnl_precise).toBeCloseTo(12.347, 3)
    expect(t.total_fees_precise).toBeCloseTo(0.1234, 4)
    expect(t.gross_pnl_precise).not.toBe(t.gross_pnl)
    expect(t.total_fees_precise).not.toBe(t.total_fees)
  })
})

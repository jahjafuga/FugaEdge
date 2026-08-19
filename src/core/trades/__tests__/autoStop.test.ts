// v0.2.7 Feature 3 Commit 2 — the auto-stop engine.
//
// Every test here runs against the PURE module: the three operations are planned
// as data and handed to an injected writer, so a fixture book is the whole world
// and no engine, no transaction and no backup file is involved.
//
// The load-bearing property is negative: a stop the user typed must survive all
// three operations untouched. T9, T10 and T11 assert that from each direction,
// because the cost of getting it wrong is hand-entered data that nothing in the
// app can reconstruct.

import { describe, expect, it, vi } from 'vitest'
import {
  deriveStop,
  isValidStopPct,
  planApply,
  planClear,
  planRederive,
  runAutoStop,
  type AutoStopDeps,
  type AutoStopTrade,
  type StopUpdate,
} from '../autoStop'

// ── fixtures ────────────────────────────────────────────────────────────────
type Fill = { side: 'B' | 'S'; price: number; time: string }

function mk(over: Partial<AutoStopTrade> & { id: number }): AutoStopTrade {
  return {
    side: 'long',
    planned_stop_loss_price: null,
    stop_source: null,
    executions: [],
    avg_buy_price: 0,
    avg_sell_price: 0,
    ...over,
  }
}

/** A long whose FIRST buy is `first` and whose later adds pull the average away
 *  from it — the only fixture shape that can tell first-entry and avg apart. */
function longWithAdds(id: number, first: number, adds: number[]): AutoStopTrade {
  const fills: Fill[] = [
    { side: 'B', price: first, time: '2026-08-10T13:30:00Z' },
    ...adds.map((p, i) => ({
      side: 'B' as const,
      price: p,
      time: '2026-08-10T13:3' + (i + 1) + ':00Z',
    })),
  ]
  const avg = (first + adds.reduce((a, b) => a + b, 0)) / (1 + adds.length)
  return mk({ id, side: 'long', executions: fills, avg_buy_price: avg })
}

/** Deps whose writer records the plan it was handed instead of touching a DB. */
function deps(trades: AutoStopTrade[]) {
  const written: StopUpdate[][] = []
  const order: string[] = []
  const backup = vi.fn(async () => {
    order.push('backup')
    return { path: 'x', name: 'x', bytes: 1 }
  })
  const writeStops = vi.fn((updates: StopUpdate[]) => {
    order.push('write')
    written.push(updates)
    // Apply to the fixture book so a second run sees the first run's effect.
    for (const u of updates) {
      const t = trades.find((x) => x.id === u.id)
      if (t) {
        t.planned_stop_loss_price = u.stop
        t.stop_source = u.source
      }
    }
    return updates.length
  })
  const d: AutoStopDeps = { listTrades: () => trades, writeStops, backup }
  return { d, written, order, backup, writeStops }
}

const ON = { enabled: true, pct: 3.5 }

// ── T6 ──────────────────────────────────────────────────────────────────────
describe('the derivation', () => {
  it('T6 LONG: first entry 7.50 at 3.5% stores 7.2375 — UNROUNDED, not 7.24', () => {
    const stop = deriveStop(7.5, 'long', 3.5)
    expect(stop).toBe(7.2375)
    // The house convention rounds at DISPLAY. Storing 7.24 would bake a
    // rounding error into every R this trade ever reports.
    expect(stop).not.toBe(7.24)
  })

  it('T7 SHORT: the same percentage goes the OTHER way — 7.50 at 3.5% is 7.7625', () => {
    const stop = deriveStop(7.5, 'short', 3.5)
    expect(stop).toBe(7.7625)
    expect(stop as number).toBeGreaterThan(7.5)
  })

  it('T8 uses the FIRST entry, never the average', () => {
    // First buy 10, adds at 12 and 14 → avg 12. The two answers differ by 20%.
    const t = longWithAdds(1, 10, [12, 14])
    expect(t.avg_buy_price).toBe(12)
    const plan = planApply([t], 10)
    expect(plan).toHaveLength(1)
    expect(plan[0].stop).toBe(9) // 10 x 0.90 — from the FIRST fill
    expect(plan[0].stop).not.toBe(10.8) // 12 x 0.90 — what the average would give
  })

  it('T13 no first entry means no stop is derived and no source is set', () => {
    const t = mk({ id: 1, executions: [] })
    expect(planApply([t], 3.5)).toEqual([])
    expect(deriveStop(null, 'long', 3.5)).toBeNull()
  })

  it('T14 percentage validation rejects 0, 100 and negatives', () => {
    // A 0% stop puts the stop at the entry: risk per share is zero and every R
    // it feeds divides by zero. 100% or more prices the stop at or below zero.
    expect(isValidStopPct(0)).toBe(false)
    expect(isValidStopPct(100)).toBe(false)
    expect(isValidStopPct(-3.5)).toBe(false)
    expect(isValidStopPct(Number.NaN)).toBe(false)
    expect(isValidStopPct(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isValidStopPct(3.5)).toBe(true)
    expect(isValidStopPct(99.9)).toBe(true)
  })
})

// ── the three operations ────────────────────────────────────────────────────
describe('APPLY / RE-DERIVE / CLEAR never touch a typed stop', () => {
  /** manual + auto + null, the shape every operation has to survive. */
  function mixedBook(): AutoStopTrade[] {
    return [
      // 1 — the user typed this. Untouchable by every operation.
      mk({
        id: 1,
        planned_stop_loss_price: 6.1234,
        stop_source: 'manual',
        executions: [{ side: 'B', price: 7.5, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 7.5,
      }),
      // 2 — the app derived this one earlier.
      mk({
        id: 2,
        planned_stop_loss_price: 9.65,
        stop_source: 'auto',
        executions: [{ side: 'B', price: 10, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 10,
      }),
      // 3 — no stop at all.
      mk({
        id: 3,
        executions: [{ side: 'B', price: 20, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 20,
      }),
    ]
  }

  it('T9 APPLY fills only the empty stop and leaves the manual value byte-identical', async () => {
    const book = mixedBook()
    const manualBefore = book[0].planned_stop_loss_price
    const autoBefore = book[1].planned_stop_loss_price
    const { d, written } = deps(book)

    const r = await runAutoStop('apply', ON, d)

    expect(r.changed).toBe(1)
    expect(written[0].map((u) => u.id)).toEqual([3])
    expect(book[0].planned_stop_loss_price).toBe(manualBefore) // untouched
    expect(book[0].stop_source).toBe('manual')
    expect(book[1].planned_stop_loss_price).toBe(autoBefore) // APPLY only fills empties
    expect(book[2].planned_stop_loss_price).toBe(19.3) // 20 x 0.965
    expect(book[2].stop_source).toBe('auto')
  })

  it('T10 RE-DERIVE updates the auto row and leaves the manual one untouched', async () => {
    const book = mixedBook()
    const manualBefore = book[0].planned_stop_loss_price
    const { d, written } = deps(book)

    const r = await runAutoStop('rederive', { enabled: true, pct: 10 }, d)

    expect(written[0].map((u) => u.id)).toEqual([2])
    expect(r.changed).toBe(1)
    expect(book[1].planned_stop_loss_price).toBe(9) // 10 x 0.90, re-derived
    expect(book[1].stop_source).toBe('auto')
    expect(book[0].planned_stop_loss_price).toBe(manualBefore)
    expect(book[0].stop_source).toBe('manual')
    expect(book[2].planned_stop_loss_price).toBeNull() // RE-DERIVE never fills
  })

  it('T11 CLEAR nulls only the auto row; the manual stop and its source survive', async () => {
    const book = mixedBook()
    const manualBefore = book[0].planned_stop_loss_price
    const { d, written } = deps(book)

    const r = await runAutoStop('clear', { enabled: true, pct: 3.5 }, d)

    expect(written[0]).toEqual([{ id: 2, stop: null, source: null }])
    expect(r.changed).toBe(1)
    expect(book[1].planned_stop_loss_price).toBeNull()
    expect(book[1].stop_source).toBeNull()
    expect(book[0].planned_stop_loss_price).toBe(manualBefore)
    expect(book[0].stop_source).toBe('manual')
  })

  it('T12 APPLY is idempotent — the second run changes nothing and takes no backup', async () => {
    const book = mixedBook()
    const { d, backup, writeStops } = deps(book)

    const first = await runAutoStop('apply', ON, d)
    const snapshot = JSON.stringify(book)
    const second = await runAutoStop('apply', ON, d)

    expect(first.changed).toBe(1)
    expect(second.changed).toBe(0)
    expect(JSON.stringify(book)).toBe(snapshot)
    expect(writeStops).toHaveBeenCalledTimes(1)
    expect(backup).toHaveBeenCalledTimes(1) // nothing to write, nothing to protect
  })

  it('planClear and planRederive are blind to a manual row by construction', () => {
    const book = mixedBook()
    expect(planClear(book).map((u) => u.id)).toEqual([2])
    expect(planRederive(book, 10).map((u) => u.id)).toEqual([2])
  })
})

// ── T15 / T16 ───────────────────────────────────────────────────────────────
describe('the guards', () => {
  const OFF = { enabled: false, pct: 3.5 }

  /** An empty stop, plus a derived one, plus a typed one. */
  const offBook = () => [
    mk({
      id: 1,
      executions: [{ side: 'B', price: 20, time: '2026-08-10T13:30:00Z' }],
      avg_buy_price: 20,
    }),
    mk({ id: 2, planned_stop_loss_price: 9.65, stop_source: 'auto' }),
    mk({ id: 3, planned_stop_loss_price: 6.1234, stop_source: 'manual' }),
  ]

  it('T25 STAND-DOWN: with the setting off, APPLY and RE-DERIVE do not run', async () => {
    // Narrowed from the original three-way guard. CLEAR is deliberately NOT in this
    // list any more — see T24. The two operations that WRITE derived values are the
    // ones the switch governs.
    for (const op of ['apply', 'rederive'] as const) {
      const book = offBook()
      const snapshot = JSON.stringify(book)
      const { d, backup, writeStops } = deps(book)

      const r = await runAutoStop(op, OFF, d)

      expect(r.ran, op + ' ran with the setting off').toBe(false)
      expect(r.changed).toBe(0)
      expect(writeStops).not.toHaveBeenCalled()
      expect(backup).not.toHaveBeenCalled()
      expect(JSON.stringify(book)).toBe(snapshot)
    }
  })

  it('T24 CLEAR still runs with the setting OFF, and still nulls only the auto row', async () => {
    // CLEAR is the undo. Gating it behind the switch that created the rows would
    // mean a user who turns the feature off can never remove what it wrote — the
    // one state where the undo is most likely to be wanted is the one where it
    // would have been unreachable.
    const book = offBook()
    const manualBefore = book[2].planned_stop_loss_price
    const { d, written } = deps(book)

    const r = await runAutoStop('clear', OFF, d)

    expect(r.ran).toBe(true)
    expect(r.changed).toBe(1)
    expect(written[0]).toEqual([{ id: 2, stop: null, source: null }])
    expect(book[1].planned_stop_loss_price).toBeNull()
    expect(book[1].stop_source).toBeNull()
    // The two rows CLEAR must never reach, with the switch off exactly as with it on.
    expect(book[0].planned_stop_loss_price).toBeNull()
    expect(book[2].planned_stop_loss_price).toBe(manualBefore)
    expect(book[2].stop_source).toBe('manual')
  })

  it('T26 CLEAR with the setting off STILL takes the backup first', async () => {
    // Ungating CLEAR must not ungate it from the safety rule: it is still a bulk
    // write over the whole book, and it is the only operation that DELETES values.
    const book = offBook()
    const { d, order } = deps(book)

    await runAutoStop('clear', OFF, d)
    expect(order).toEqual(['backup', 'write'])

    // ...and a failing backup still aborts it with nothing changed.
    const book2 = offBook()
    const snapshot = JSON.stringify(book2)
    const bad = deps(book2)
    bad.d.backup = vi.fn(async () => {
      throw new Error('disk full')
    })
    await expect(runAutoStop('clear', OFF, bad.d)).rejects.toThrow('disk full')
    expect(bad.writeStops).not.toHaveBeenCalled()
    expect(JSON.stringify(book2)).toBe(snapshot)
  })

  it('T15b an invalid percentage refuses the write rather than storing a garbage stop', async () => {
    const book = [
      mk({
        id: 1,
        executions: [{ side: 'B', price: 20, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 20,
      }),
    ]
    const { d, writeStops } = deps(book)
    const r = await runAutoStop('apply', { enabled: true, pct: 0 }, d)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('invalid-pct')
    expect(writeStops).not.toHaveBeenCalled()
  })

  it('T16 the backup is taken BEFORE the write, and a failing backup aborts with zero rows changed', async () => {
    const book = [
      mk({
        id: 1,
        executions: [{ side: 'B', price: 20, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 20,
      }),
    ]
    const snapshot = JSON.stringify(book)

    // Order first.
    const ok = deps(book)
    await runAutoStop('apply', ON, ok.d)
    expect(ok.order).toEqual(['backup', 'write'])

    // Then the failure. Same book shape, fresh fixture.
    const book2 = [
      mk({
        id: 1,
        executions: [{ side: 'B', price: 20, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 20,
      }),
    ]
    const bad = deps(book2)
    bad.d.backup = vi.fn(async () => {
      throw new Error('disk full')
    })

    await expect(runAutoStop('apply', ON, bad.d)).rejects.toThrow('disk full')
    expect(bad.writeStops).not.toHaveBeenCalled()
    expect(JSON.stringify(book2)).toBe(snapshot)
  })
})

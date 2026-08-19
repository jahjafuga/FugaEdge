// v0.2.7 Feature 3 Commit 3 — T18 (the manual latch), T20 (import), T22 (no dead
// engine), T23 (stand-down).
//
// T22 is the same shape as the range filter's T30, and for the same reason: the
// previous feature shipped an engine no user could reach, and the guard that caught
// it walked the chain end to end instead of trusting that a wired-looking call site
// existed. This one reads the source and fails if any operation the engine exposes
// has no call site outside the engine and its own tests.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  planRederive,
  runAutoStop,
  stopSourceForManualSave,
  type AutoStopDeps,
  type AutoStopTrade,
  type StopUpdate,
} from '../autoStop'

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

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

function deps(trades: AutoStopTrade[]) {
  const writeStops = vi.fn((updates: StopUpdate[]) => {
    for (const u of updates) {
      const t = trades.find((x) => x.id === u.id)
      if (t) {
        t.planned_stop_loss_price = u.stop
        t.stop_source = u.source
      }
    }
    return updates.length
  })
  const d: AutoStopDeps = {
    listTrades: () => trades,
    writeStops,
    backup: async () => ({ path: 'x', name: 'x', bytes: 1 }),
  }
  return { d, writeStops }
}

/** A freshly imported trade: fills, no stop, no provenance. */
const imported = (id: number, entry: number) =>
  mk({
    id,
    executions: [{ side: 'B', price: entry, time: '2026-08-10T13:30:00Z' }],
    avg_buy_price: entry,
  })

// ── T18 ─────────────────────────────────────────────────────────────────────
describe('T18 editing a stop latches it to manual, permanently', () => {
  it('a typed price becomes manual; clearing it removes the attribution with the value', () => {
    expect(stopSourceForManualSave(7.24)).toBe('manual')
    expect(stopSourceForManualSave(0.0125)).toBe('manual')
    // No stop means nothing to attribute — the same rule the migration applied to
    // every empty row, so the two can never disagree about what null means.
    expect(stopSourceForManualSave(null)).toBeNull()
  })

  it('and a later RE-DERIVE leaves that row exactly as the user left it', () => {
    // The value the editor would have stored, carried straight into the engine.
    const typed = 6.1234
    const book = [
      mk({
        id: 1,
        planned_stop_loss_price: typed,
        stop_source: stopSourceForManualSave(typed),
        executions: [{ side: 'B', price: 10, time: '2026-08-10T13:30:00Z' }],
        avg_buy_price: 10,
      }),
    ]
    expect(planRederive(book, 25)).toEqual([])
    expect(book[0].planned_stop_loss_price).toBe(typed)
    expect(book[0].stop_source).toBe('manual')
  })

  it('the save path writes BOTH columns — a price without its provenance is the bug', () => {
    const repo = src('electron/trades/planned-risk.ts')
    expect(repo).toContain('stopSourceForManualSave')
    expect(repo).toMatch(/UPDATE trades SET planned_stop_loss_price = \?, stop_source = \?/)
  })
})

// ── T20 ─────────────────────────────────────────────────────────────────────
describe('T20 an import auto-fills only when the setting is on', () => {
  it('ON: the newly imported trade gets a derived stop', async () => {
    const book = [imported(1, 20)]
    const { d } = deps(book)
    const r = await runAutoStop('apply', { enabled: true, pct: 3.5 }, d)
    expect(r.changed).toBe(1)
    expect(book[0].planned_stop_loss_price).toBe(19.3)
    expect(book[0].stop_source).toBe('auto')
  })

  it('OFF: the same import leaves it exactly as the broker delivered it', async () => {
    const book = [imported(1, 20)]
    const { d, writeStops } = deps(book)
    const r = await runAutoStop('apply', { enabled: false, pct: 3.5 }, d)
    expect(r.ran).toBe(false)
    expect(writeStops).not.toHaveBeenCalled()
    expect(book[0].planned_stop_loss_price).toBeNull()
    expect(book[0].stop_source).toBeNull()
  })

  it('the import commit actually calls it — the wiring, not just the capability', () => {
    const ipcSrc = src('electron/import/ipc.ts')
    expect(ipcSrc).toContain('runAutoStopOperation')
  })
})

// ── T22 ─────────────────────────────────────────────────────────────────────
describe('T22 NO DEAD ENGINE', () => {
  /** The operations the engine declares, read from its own union type so adding a
   *  fourth cannot slip past this guard. */
  function declaredOps(): string[] {
    const engine = src('src/core/trades/autoStop.ts')
    const m = engine.match(/export type AutoStopOp =([^\n]+)/)
    expect(m, 'AutoStopOp union not found — did the type move?').toBeTruthy()
    return Array.from((m as RegExpMatchArray)[1].matchAll(/'([a-z]+)'/g)).map((x) => x[1])
  }

  /** Every file that may legitimately invoke an operation. */
  const CALLERS = [
    'src/components/settings/AutoStopSettingsSection.tsx',
    'electron/import/ipc.ts',
    'electron/trades/ipc.ts',
  ]

  it('declares exactly the three operations the brief specifies', () => {
    expect(declaredOps()).toEqual(['apply', 'rederive', 'clear'])
  })

  it('every declared operation is invoked from a real UI or import call site', () => {
    const callers = CALLERS.map(src).join('\n')
    for (const op of declaredOps()) {
      expect(
        callers.includes(`'${op}'`),
        `the engine exposes '${op}' but nothing outside the engine ever asks for it`,
      ).toBe(true)
    }
  })

  it('the operation reaches the main process through a registered IPC channel', () => {
    expect(src('shared/ipc-channels.ts')).toContain('AUTO_STOP_RUN')
    expect(src('electron/trades/ipc.ts')).toContain('IPC.AUTO_STOP_RUN')
    expect(src('electron/preload/index.ts')).toContain('IPC.AUTO_STOP_RUN')
  })
})

// ── T23 ─────────────────────────────────────────────────────────────────────
describe('T23 STAND-DOWN: off means the app behaves as it did before this feature', () => {
  it('an import of a mixed book writes nothing at all', async () => {
    // CLEAR is in this loop even though it is no longer gated on the setting (T24):
    // this book holds no 'auto' rows, so there is nothing for it to remove. That is
    // exactly the pre-feature state — an untouched book stays untouched whichever
    // operation is asked for.
    const book = [
      imported(1, 20),
      mk({ id: 2, planned_stop_loss_price: 6.5, stop_source: 'manual' }),
    ]
    const snapshot = JSON.stringify(book)
    const { d, writeStops } = deps(book)

    for (const op of ['apply', 'rederive', 'clear'] as const) {
      await runAutoStop(op, { enabled: false, pct: 3.5 }, d)
    }

    expect(writeStops).not.toHaveBeenCalled()
    expect(JSON.stringify(book)).toBe(snapshot)
  })

  it('the trade detail still saves a typed stop with the feature off — editing is not gated', () => {
    // The manual latch has nothing to do with the setting. A user who never turns
    // auto-fill on must still be able to type a stop and have it recorded as theirs.
    expect(stopSourceForManualSave(9.5)).toBe('manual')
  })
})

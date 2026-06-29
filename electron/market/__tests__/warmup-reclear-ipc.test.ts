// v0.2.4 §K.1.4 — IPC handler contract for the Settings "Recover stranded
// indicators" button (WARMUP_RECLEAR). Mirrors get-trade-ipc.test.ts's shim:
// better-sqlite3 won't load under vitest, so we mock every module
// registerMarketIpc pulls in, capture ipcMain.handle registrations into a map,
// and invoke the captured handler directly.
//
// The handler IS the warmup-wipe guard. Recovery must re-clear the stranded
// markers and re-queue the throttled warmup → technicals → xp chain WITHOUT ever
// routing through refreshIntraday — the intraday refresh path overwrites
// warmup_bars and would undo the very recovery this button performs. That
// negative assertion (refreshIntraday is NEVER called) is the load-bearing one.
//
// Reporting nuance: reclearStrandedWarmupMarkers returns cleared KEYS, but the
// button reports TRADES, so the handler joins keys → trades via tradeCountsByKey
// and returns { recleared, tradesQueued }.

import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'

const {
  handlers,
  sendSpy,
  reclearSpy,
  tradeCountsSpy,
  runWarmupBackfillSpy,
  runTradeTechnicalsBackfillSpy,
  runXpReconcileSpy,
  refreshIntradaySpy,
} = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
  sendSpy: vi.fn(),
  reclearSpy: vi.fn(),
  tradeCountsSpy: vi.fn(),
  runWarmupBackfillSpy: vi.fn(async () => ({})),
  runTradeTechnicalsBackfillSpy: vi.fn(async () => ({})),
  runXpReconcileSpy: vi.fn(),
  refreshIntradaySpy: vi.fn(async () => ({ cancelled: false })),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
  BrowserWindow: {
    fromWebContents: () => ({ webContents: { send: sendSpy } }),
  },
}))
vi.mock('../fetch', () => ({ refreshMarketData: vi.fn(), cancelMarketRefresh: vi.fn() }))
vi.mock('../intraday', () => ({
  refreshIntraday: refreshIntradaySpy,
  cancelIntradayRefresh: vi.fn(),
}))
vi.mock('../bars-get', () => ({ getIntradayBars: vi.fn() }))
vi.mock('../warmup-backfill', () => ({ runWarmupBackfill: runWarmupBackfillSpy }))
vi.mock('../../technicals/backfill', () => ({
  runTradeTechnicalsBackfill: runTradeTechnicalsBackfillSpy,
}))
vi.mock('../../xp/reconcile', () => ({ runXpReconcile: runXpReconcileSpy }))
vi.mock('../repo', () => ({
  reclearStrandedWarmupMarkers: reclearSpy,
  tradeCountsByKey: tradeCountsSpy,
}))

import { registerMarketIpc } from '../ipc'
import { IPC } from '@shared/ipc-channels'

const invoke = (ch: string, input?: unknown) => handlers.get(ch)!({ sender: {} }, input)
// The chain is fire-and-forget; a macrotask drains its pending microtasks.
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeAll(() => {
  registerMarketIpc()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('market:warmupReclearStranded IPC handler', () => {
  it('returns recleared count + trade total, fires warmup→technicals→xp in the background, and NEVER calls refreshIntraday', async () => {
    reclearSpy.mockReturnValue([
      { symbol: 'AAA', date: '2026-05-01' },
      { symbol: 'BBB', date: '2026-05-02' },
    ])
    tradeCountsSpy.mockReturnValue({ 'AAA|2026-05-01': 3, 'BBB|2026-05-02': 2 })

    const result = await invoke(IPC.WARMUP_RECLEAR)

    // (1) returns the cleared-key count + the TRADE total joined from those keys.
    expect(result).toEqual({ recleared: 2, tradesQueued: 5 })
    expect(reclearSpy).toHaveBeenCalledTimes(1)
    expect(tradeCountsSpy).toHaveBeenCalledTimes(1)
    expect(tradeCountsSpy).toHaveBeenCalledWith([
      { symbol: 'AAA', date: '2026-05-01' },
      { symbol: 'BBB', date: '2026-05-02' },
    ])

    await flush()

    // (3) the background re-fetch chain runs, in the load-bearing order.
    expect(runWarmupBackfillSpy).toHaveBeenCalledTimes(1)
    expect(runTradeTechnicalsBackfillSpy).toHaveBeenCalledTimes(1)
    expect(runXpReconcileSpy).toHaveBeenCalledTimes(1)
    expect(runWarmupBackfillSpy.mock.invocationCallOrder[0]).toBeLessThan(
      runTradeTechnicalsBackfillSpy.mock.invocationCallOrder[0],
    )
    expect(runTradeTechnicalsBackfillSpy.mock.invocationCallOrder[0]).toBeLessThan(
      runXpReconcileSpy.mock.invocationCallOrder[0],
    )

    // (2) CRITICAL — recovery must NOT route through the intraday refresh, which
    // overwrites warmup_bars and would wipe the data this button recovers.
    expect(refreshIntradaySpy).not.toHaveBeenCalled()
  })

  it('short-circuits to zero when nothing is stranded — no trade join, no chain, no refreshIntraday', async () => {
    reclearSpy.mockReturnValue([])

    const result = await invoke(IPC.WARMUP_RECLEAR)

    expect(result).toEqual({ recleared: 0, tradesQueued: 0 })
    expect(tradeCountsSpy).not.toHaveBeenCalled()

    await flush()

    expect(runWarmupBackfillSpy).not.toHaveBeenCalled()
    expect(runTradeTechnicalsBackfillSpy).not.toHaveBeenCalled()
    expect(runXpReconcileSpy).not.toHaveBeenCalled()
    expect(refreshIntradaySpy).not.toHaveBeenCalled()
  })
})

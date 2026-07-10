// Cache-invalidation contract for MARKET_REFRESH.
//
// refreshMarketData (electron/market/fetch.ts) writes market_data rows, which the
// memoized reports payload reads via getReports — getAllMarketRows() feeds the
// byFloat / byRvol Volume Analysis (electron/reports/get.ts:262) and the
// sector / industry enrichment (get.ts:440). reports is version-stamped against
// the shared global dataVersion (electron/lib/cache.ts:61 requires
// hit.version === dataVersion), so a refresh that never bumps leaves
// reports:${scope} serving pre-refresh market_data until TTL/restart. The handler
// must bump AFTER the async refresh resolves. analytics does NOT read market_data,
// so this is the reports cache only — same defect class as 4cf6349, last handler.
//
// Mirrors the settings/journal/calendar/day cache-invalidation tests: REAL cache
// module; every heavy dependency the registrar pulls at import is stubbed (no DB,
// no network, no Polygon, no BrowserWindow). The proof is a recompute after the
// bump — a live payload going stale — not "a function was called".

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
  // The MARKET_REFRESH handler resolves a webContents via BrowserWindow to gate
  // progress emits; return null so emitProgress stays undefined (no renderer).
  BrowserWindow: { fromWebContents: () => null },
}))

// Stub every non-cache dependency the registrar imports. The cache is the ONLY
// real module — the whole point is to prove the memoize entry invalidates.
vi.mock('../fetch', () => ({
  refreshMarketData: vi.fn(async () => ({
    attempted: 1,
    fetched: 1,
    failed: 0,
    skipped: 0,
    apiKeyMissing: false,
    errors: [],
    durationMs: 1,
    cancelled: false,
  })),
  cancelMarketRefresh: vi.fn(),
}))
vi.mock('../intraday', () => ({
  refreshIntraday: vi.fn(async () => ({ cancelled: false })),
  cancelIntradayRefresh: vi.fn(),
}))
vi.mock('../bars-get', () => ({ getIntradayBars: vi.fn() }))
vi.mock('../warmup-backfill', () => ({ runWarmupBackfill: vi.fn(async () => {}) }))
vi.mock('../../technicals/backfill', () => ({
  runTradeTechnicalsBackfill: vi.fn(async () => {}),
}))
vi.mock('../../xp/reconcile', () => ({ runXpReconcile: vi.fn() }))
vi.mock('../repo', () => ({
  reclearStrandedWarmupMarkers: vi.fn(() => []),
  tradeCountsByKey: vi.fn(() => ({})),
}))

import { registerMarketIpc } from '../ipc'
import { refreshMarketData } from '../fetch'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerMarketIpc()
const invoke = (ch: string, input?: unknown) => handlers.get(ch)!({}, input)

beforeEach(() => {
  clearCache()
  vi.clearAllMocks()
})

describe('MARKET_REFRESH — reports cache invalidation (market_data)', () => {
  it('invalidates reports:all so the next read recomputes against the refreshed market_data', async () => {
    // Seed the reports memoize at the current dataVersion — a warm cache.
    let n = 0
    const compute = vi.fn(() => ({ tick: ++n }))
    expect(memoize('reports:all', compute).tick).toBe(1)
    expect(compute).toHaveBeenCalledTimes(1)
    // A second read HITS (still tick 1) — proves the seed is genuinely cached,
    // so a later recompute can only be the invalidation, not a cold store.
    expect(memoize('reports:all', compute).tick).toBe(1)
    expect(compute).toHaveBeenCalledTimes(1)

    const v0 = getDataVersion()
    await invoke(IPC.MARKET_REFRESH, { force: true })

    // The refresh ran, and the version advanced -> every memoize entry is stale.
    expect(refreshMarketData).toHaveBeenCalledTimes(1)
    expect(getDataVersion()).toBe(v0 + 1)

    // The NEXT reports read MISSES (version mismatch) and RECOMPUTES — it reflects
    // post-refresh market_data, not the pre-refresh payload. This is the proof.
    expect(memoize('reports:all', compute).tick).toBe(2)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('bumps only AFTER refreshMarketData resolves (proves the handler awaits — no race)', async () => {
    // Gate the refresh so we can observe the window while it is in flight.
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    vi.mocked(refreshMarketData).mockImplementationOnce(async () => {
      await gate
      return {
        attempted: 0,
        fetched: 0,
        failed: 0,
        skipped: 0,
        apiKeyMissing: false,
        errors: [],
        durationMs: 0,
        cancelled: false,
      }
    })

    const v0 = getDataVersion()
    const p = invoke(IPC.MARKET_REFRESH, {})
    // refreshMarketData is suspended on the gate -> the bump has NOT run yet.
    await Promise.resolve()
    expect(getDataVersion()).toBe(v0)
    // Let the refresh resolve -> the awaited bump now fires.
    release()
    await p
    expect(getDataVersion()).toBe(v0 + 1)
  })
})

describe('MARKET_REFRESH_CANCEL — regression guard (no bump)', () => {
  it('does NOT bump — a cancel writes no market_data', async () => {
    // The representative correctly-no-bump sibling: a coarse cancel flips a module
    // flag and writes nothing, so it must never invalidate the analytics/reports
    // caches. Mirrors the calendar test's WEEK_NOTES_SAVE no-bump guard.
    const v0 = getDataVersion()
    await invoke(IPC.MARKET_REFRESH_CANCEL)
    expect(getDataVersion()).toBe(v0)
  })
})

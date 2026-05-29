import { describe, expect, it, vi, type Mock } from 'vitest'
import type { IntradayRefreshResult } from '@shared/market-types'

// Commit P.5: refresh state lives in a module-level store (mirrors theme.ts) so
// it survives a tab switch — Settings can unmount/remount and still read the
// running flag + latest progress. The store owns the trigger + await + progress
// subscription. These assert: start→running, progress updates, a simulated
// remount still reports running + CURRENT progress, and completion clears.

vi.mock('@/lib/ipc', () => ({
  ipc: {
    marketRefresh: vi.fn(),
    marketIntradayRefresh: vi.fn(),
    marketOnRefreshProgress: vi.fn(() => () => {}),
    marketOnIntradayProgress: vi.fn(() => () => {}),
  },
}))

import { ipc } from '@/lib/ipc'
import { startIntradayRefresh, getRefreshState } from '../refreshStore'

describe('refreshStore — survives a tab switch (module-level retention)', () => {
  it('retains running + latest progress across a remount, then clears on completion', async () => {
    let resolveRun!: (r: IntradayRefreshResult) => void
    ;(ipc.marketIntradayRefresh as Mock).mockImplementation(
      () => new Promise<IntradayRefreshResult>((res) => { resolveRun = res }),
    )
    let progressCb: ((p: { current: number; total: number; symbol: string }) => void) | null = null
    ;(ipc.marketOnIntradayProgress as Mock).mockImplementation(
      (cb: (p: { current: number; total: number; symbol: string }) => void) => {
        progressCb = cb
        return () => {}
      },
    )

    const run = startIntradayRefresh(true)

    // start sets running; no progress event yet
    expect(getRefreshState().intraday.running).toBe(true)
    expect(getRefreshState().intraday.progress).toBeNull()

    // a progress event from main updates the store
    progressCb!({ current: 2, total: 6, symbol: 'AAA' })
    expect(getRefreshState().intraday.progress).toEqual({ current: 2, total: 6, symbol: 'AAA' })

    // SIMULATED REMOUNT — re-reading the module store still reports running +
    // the CURRENT progress (not zero/Starting). This is the load-bearing claim:
    // component state would have reset; module state must not.
    const onRemount = getRefreshState()
    expect(onRemount.intraday.running).toBe(true)
    expect(onRemount.intraday.progress).toEqual({ current: 2, total: 6, symbol: 'AAA' })

    // completion-while-away — resolve with the all-403 fast case (fetched 0)
    resolveRun({
      attempted: 6, fetched: 0, failed: 6, apiKeyMissing: false,
      errors: [], emaBackfilled: 0, maeMfeBackfilled: 0, durationMs: 1,
    })
    await run

    // cleared/completed — not frozen at the last-seen number
    expect(getRefreshState().intraday.running).toBe(false)
    expect(getRefreshState().intraday.progress).toBeNull()
    expect(getRefreshState().intraday.result?.failed).toBe(6)
  })
})

import { useSyncExternalStore } from 'react'
import { ipc } from '@/lib/ipc'
import type {
  IntradayRefreshResult,
  MarketRefreshProgress,
  MarketRefreshResult,
} from '@shared/market-types'

// Module-level store for the market/intraday refresh, mirroring theme.ts's
// external-store pattern. Refresh state lives HERE, not in the Settings
// component, so it survives a tab switch: Settings can unmount and remount and
// still read the running flag + latest progress. The store owns the trigger,
// the awaited IPC call, and the progress subscription — so it also reflects
// completion (running clears in finally), not just per-event progress.
//
// Known limitation (logged as Commit P.5's scope boundary): a full app reload
// mid-run wipes this module memory; reload-survival would need Approach 2
// (main exposes queryable running-state). Out of scope for "survive a tab
// switch". Web-portable: pure renderer state over the existing typed preload.

interface RefreshSlice<R> {
  running: boolean
  progress: MarketRefreshProgress | null
  result: R | null
  error: string | null
}

export interface RefreshState {
  market: RefreshSlice<MarketRefreshResult>
  intraday: RefreshSlice<IntradayRefreshResult>
}

const emptySlice = <R>(): RefreshSlice<R> => ({
  running: false,
  progress: null,
  result: null,
  error: null,
})

let state: RefreshState = {
  market: emptySlice<MarketRefreshResult>(),
  intraday: emptySlice<IntradayRefreshResult>(),
}

type Listener = () => void
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Stable between mutations — useSyncExternalStore needs the same reference until
// state actually changes. We replace `state` immutably on every patch.
function getSnapshot(): RefreshState {
  return state
}

/** Plain read of the current store value (non-hook) — used by tests and any
 *  imperative caller. The hook below is the component-facing API. */
export function getRefreshState(): RefreshState {
  return state
}

function patchMarket(patch: Partial<RefreshSlice<MarketRefreshResult>>): void {
  state = { ...state, market: { ...state.market, ...patch } }
  emit()
}

function patchIntraday(patch: Partial<RefreshSlice<IntradayRefreshResult>>): void {
  state = { ...state, intraday: { ...state.intraday, ...patch } }
  emit()
}

// Progress subscription is set up once, lazily on first start, and kept for the
// renderer session — so events are caught regardless of which tab is mounted
// (no per-component unsubscribe). No import-time side effect.
let subscribed = false
function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  ipc.marketOnRefreshProgress((p) => patchMarket({ progress: p }))
  ipc.marketOnIntradayProgress((p) => patchIntraday({ progress: p }))
}

/** Start a market-data refresh. No-ops if one is already running. Resolves to
 *  true on success, false on error/already-running (so the caller can reset its
 *  local Force checkbox only on success). */
export async function startMarketRefresh(force: boolean): Promise<boolean> {
  if (state.market.running) return false
  ensureSubscribed()
  patchMarket({ running: true, progress: null, result: null, error: null })
  try {
    const result = await ipc.marketRefresh(force)
    patchMarket({ result })
    return true
  } catch (e) {
    patchMarket({ error: e instanceof Error ? e.message : String(e) })
    return false
  } finally {
    patchMarket({ running: false, progress: null })
  }
}

/** Start an intraday (1-min bars) refresh. Same contract as startMarketRefresh. */
export async function startIntradayRefresh(force: boolean): Promise<boolean> {
  if (state.intraday.running) return false
  ensureSubscribed()
  patchIntraday({ running: true, progress: null, result: null, error: null })
  try {
    const result = await ipc.marketIntradayRefresh(force)
    patchIntraday({ result })
    return true
  } catch (e) {
    patchIntraday({ error: e instanceof Error ? e.message : String(e) })
    return false
  } finally {
    patchIntraday({ running: false, progress: null })
  }
}

/** Component-facing hook — re-renders subscribers on any store change. */
export function useRefreshState(): RefreshState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

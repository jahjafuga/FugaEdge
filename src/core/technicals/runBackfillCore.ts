// Session 3 — pure bulk-backfill orchestration core for trade_technicals.
//
// Domain logic only: enumerate stale trade ids, chunk them, hydrate each chunk,
// compute (or placeholder) per trade, and persist. Every side-effecting
// dependency is INJECTED (BackfillCoreDeps) so this module imports no electron /
// fs / db / better-sqlite3 — pure per ARCHITECTURE rule 1, and the electron
// wrapper (electron/technicals/backfill.ts) is the only thing that knows about
// repos. The same core drives a future server-side cache-warm worker unchanged.
//
// Chunk-yield + per-chunk progress are delegated to the generic
// runChunkedBackfill primitive (Commit 1): each "item" handed to it is itself a
// chunk of ids, with chunkSize:1 so it yields after every chunk except the last.

import { runChunkedBackfill } from '@/lib/chunkedBackfill'
import {
  computeTradeTechnicals,
  makeIncompleteTechnicals,
  type TradeForTechnicals,
  type TradeTechnicals,
} from './computeTradeTechnicals'
import type { IntradayBar } from '@shared/market-types'

/** A trade hydrated enough to compute its technicals: identity + the narrow
 *  TradeForTechnicals shape the pure compute needs. */
export interface HydratedTrade {
  id: number
  symbol: string
  date: string
  trade: TradeForTechnicals
}

/** The intraday bars for a (symbol, date): active-day + prior-day warmup. */
export interface BarsBundle {
  bars: IntradayBar[]
  warmupBars: IntradayBar[]
}

/** Injected side-effecting dependencies — the electron wrapper supplies repo
 *  calls; tests supply fakes. */
export interface BackfillCoreDeps {
  /** Stale/missing/incomplete trade ids to (re)compute. */
  getStaleIds: () => number[]
  /** Resolve a chunk of ids to hydrated trades (missing ids may be dropped). */
  hydrateTradeChunk: (ids: readonly number[]) => HydratedTrade[]
  /** Load cached bars for a (symbol, date), or null when none are cached. */
  loadBarsForKey: (symbol: string, date: string) => BarsBundle | null
  /** Persist the computed (or placeholder) technicals for a trade. */
  persistTechnicals: (tradeId: number, technicals: TradeTechnicals) => void
  /** Fired after each chunk completes, with 1-indexed (chunkNumber, totalChunks). */
  onChunkComplete?: (chunkNumber: number, totalChunks: number) => void
  /** Awaited between chunks so a large run never blocks the host event loop. */
  yieldBetweenChunks?: () => Promise<void>
}

export interface BackfillCoreOptions {
  /** Ids per chunk. Defaults to 50; invalid values (non-integer / <= 0) fall back. */
  chunkSize?: number
}

export interface BackfillCoreResult {
  /** Trades whose real technicals were computed and persisted. */
  computed: number
  /** Trades persisted as a data_complete=false placeholder (no usable bars). */
  placeholders: number
  /** Trades that threw during hydrate→compute→persist (caught; run continued). */
  errors: number
  /** computed + placeholders + errors. */
  totalAttempted: number
  /** Wall-clock duration, in milliseconds. */
  durationMs: number
}

export async function runBackfillCore(
  deps: BackfillCoreDeps,
  options: BackfillCoreOptions = {},
): Promise<BackfillCoreResult> {
  const startedAt = Date.now()

  const ids = deps.getStaleIds()
  if (ids.length === 0) {
    return {
      computed: 0,
      placeholders: 0,
      errors: 0,
      totalAttempted: 0,
      durationMs: Date.now() - startedAt,
    }
  }

  // Positive integers only, else the default. typeof guard is for TS narrowing.
  const requested = options.chunkSize
  const chunkSize =
    typeof requested === 'number' && Number.isInteger(requested) && requested > 0
      ? requested
      : 50

  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize))
  }

  let computed = 0
  let placeholders = 0
  let errors = 0

  // Cache value can be null to memo a "no bars cached" result and avoid
  // re-querying the same (symbol, date) for every trade on it.
  const barsCache = new Map<string, BarsBundle | null>()

  // runChunkedBackfill drives the chunk-yield + per-chunk progress. Each item is
  // already a chunk of ids, so chunkSize:1 yields after every chunk but the
  // last. Per-trade failures are caught INSIDE processItem (counted in `errors`)
  // so runChunkedBackfill's own error path never fires — its returned result is
  // intentionally discarded; we use it purely for the yield + progress mechanic.
  await runChunkedBackfill<number[]>({
    items: chunks,
    chunkSize: 1,
    yieldBetweenChunks: deps.yieldBetweenChunks,
    onProgress: ({ current, total }) => deps.onChunkComplete?.(current, total),
    processItem: async (idChunk) => {
      const hydrated = deps.hydrateTradeChunk(idChunk)
      for (const h of hydrated) {
        try {
          const key = `${h.symbol}|${h.date}`
          let bars = barsCache.get(key)
          if (bars === undefined) {
            bars = deps.loadBarsForKey(h.symbol, h.date)
            barsCache.set(key, bars)
          }
          if (!bars || bars.bars.length === 0 || bars.warmupBars.length === 0) {
            deps.persistTechnicals(h.id, makeIncompleteTechnicals())
            placeholders++
          } else {
            const technicals = computeTradeTechnicals(h.trade, bars.warmupBars, bars.bars)
            deps.persistTechnicals(h.id, technicals)
            computed++
          }
        } catch {
          errors++
        }
      }
    },
  })

  return {
    computed,
    placeholders,
    errors,
    totalAttempted: computed + placeholders + errors,
    durationMs: Date.now() - startedAt,
  }
}

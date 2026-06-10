// v0.2.4 §K — bulk warmup-bars fetcher for trades that have active intraday
// bars but empty warmup_bars (the §K diagnostic's 41-trade lever). Mirrors
// runTradeTechnicalsBackfill's thin-orchestrator-over-runChunkedBackfill
// pattern: per-item try/catch and counting inside processItem, the primitive's
// result discarded. Does NOT bump dataVersion — warmup writes to intraday_bars
// only, and the technicals backfill (sequenced after this in §K's launch
// arming) handles renderer notification when technicals flip data_complete
// 0 → 1.
//
// ARCHITECTURE rule 1: this orchestrator stays thin — the chunk/yield/progress
// mechanic lives in the generic runChunkedBackfill primitive
// (src/lib/chunkedBackfill.ts); the per-key work is repo/service calls.

import type { IntradayBar } from './massive'
import type { WarmupBackfillProgress } from '@shared/market-types'
import { warmupKeysNeedingFetch, getIntradayRow, upsertIntradayRow, tradeCountsByKey } from './repo'
import { fetchWarmupBars } from './bars-get'
import { getSettings } from '../settings/repo'
import { runChunkedBackfill } from '@/lib/chunkedBackfill'

// WarmupBackfillProgress's canonical definition lives in shared/market-types.ts
// so the renderer (src/lib/ipc.ts) + preload can import it without crossing into
// electron/. Re-exported here so the orchestrator's public surface is unchanged.
export type { WarmupBackfillProgress }

// Keys per chunk. A setImmediate yield fires between chunks so a large first-run
// sweep never blocks the main-process event loop. Matches the §K spec and
// runChunkedBackfill's own default.
const CHUNK_SIZE = 50

export interface WarmupBackfillResult {
  /** Keys whose fetch returned ≥1 warmup bar. */
  fetched: number
  /** Keys whose fetch resolved with zero bars (legit for holiday/out-of-coverage). */
  empty: number
  /** Keys whose fetch threw, or whose row vanished mid-sweep. */
  errors: number
  /** fetched + empty + errors === the eligible key count. */
  totalAttempted: number
  durationMs: number
}

export interface WarmupBackfillOptions {
  onProgress?: (p: WarmupBackfillProgress) => void
}

export async function runWarmupBackfill(
  opts: WarmupBackfillOptions = {},
): Promise<WarmupBackfillResult> {
  const t0 = Date.now()

  // No API key → nothing to do, and we MUST return before touching any key: a
  // keyless run that stamped warmup_attempted_at would permanently exclude every
  // eligible key from future backfills (the marker would falsely claim
  // "attempted" when the fetch never had credentials). Defer until configured.
  const { polygon_api_key: apiKey } = getSettings().values
  if (!apiKey) {
    return { fetched: 0, empty: 0, errors: 0, totalAttempted: 0, durationMs: Date.now() - t0 }
  }

  const keys = warmupKeysNeedingFetch()
  if (keys.length === 0) {
    return { fetched: 0, empty: 0, errors: 0, totalAttempted: 0, durationMs: Date.now() - t0 }
  }

  // Pre-chunk the flat worklist into CHUNK_SIZE arrays and drive them through
  // runChunkedBackfill with chunkSize:1 — exactly runBackfillCore's shape, so
  // the primitive yields after every chunk (but the last) and its per-item
  // onProgress IS per-chunk. We count inside processItem and discard the
  // primitive's result (used purely for the yield + progress mechanic).
  const chunks: { symbol: string; date: string }[][] = []
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    chunks.push(keys.slice(i, i + CHUNK_SIZE))
  }

  // §K Beat 2.6 — translate the chunk progress into the "Computing N trades…"
  // counts the Settings row shows. tradeCountsByKey is the only keys→trades join
  // (the IPC emitters + renderer never see the keys). cumulative[i] = trades
  // whose warmup is done once chunk i finishes; tradesTotal = the whole pass.
  const counts = tradeCountsByKey(keys)
  const chunkTradeTotals = chunks.map((chunk) =>
    chunk.reduce((sum, k) => sum + (counts[`${k.symbol}|${k.date}`] ?? 0), 0),
  )
  const tradesTotal = chunkTradeTotals.reduce((a, b) => a + b, 0)
  let acc = 0
  const cumulative = chunkTradeTotals.map((n) => (acc += n))

  let fetched = 0
  let empty = 0
  let errors = 0

  await runChunkedBackfill<{ symbol: string; date: string }[]>({
    items: chunks,
    chunkSize: 1,
    yieldBetweenChunks: () => new Promise((r) => setImmediate(r)),
    onProgress: ({ current }) =>
      opts.onProgress?.({ tradesDone: cumulative[current - 1], tradesTotal }),
    processItem: async (chunk) => {
      for (const { symbol, date } of chunk) {
        const cached = getIntradayRow(symbol, date)
        if (cached === null) {
          // Row vanished between worklist enumeration and processing — only if
          // another path deleted it mid-sweep. Count honestly, skip the upsert.
          errors += 1
          continue
        }

        const attemptedAt = new Date().toISOString()
        let warmupBars: IntradayBar[] = []
        try {
          warmupBars = await fetchWarmupBars(apiKey, symbol, date)
          if (warmupBars.length === 0) empty += 1
          else fetched += 1
        } catch {
          // Network/auth failure. warmupBars stays [] and we still stamp the
          // marker below so this key isn't re-tried every launch (holiday-window
          // / out-of-coverage dates legitimately return nothing).
          errors += 1
        }

        upsertIntradayRow({
          symbol,
          date,
          bars: cached.bars, // preserved — warmup never touches the active day
          warmup_bars: warmupBars,
          warmup_attempted_at: attemptedAt,
          fetched_at: cached.fetched_at, // preserved
          error: cached.error, // preserved (always null for eligible keys)
        })
      }
    },
  })

  return {
    fetched,
    empty,
    errors,
    totalAttempted: keys.length,
    durationMs: Date.now() - t0,
  }
}

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
import { withRateLimitRetry, WARMUP_SPACING_MS } from './rate-limit'

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
  /** Injectable sleep (tests pass an instant one); defaults to setTimeout-based
   *  real sleep. Drives BOTH the inter-call spacing floor and the withRateLimitRetry
   *  backoff, so a paced run is real in prod but instant under test. */
  sleep?: (ms: number) => Promise<void>
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

  // Injectable clock (tests pass an instant sleep); real setTimeout in prod.
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  // PROACTIVE PACING (§K throttle beat). The 2026-06-10 strand was a rate-limit
  // storm: 11 keys fetched back-to-back with no spacing. Hold successive Polygon
  // calls at/under the free-tier limit via WARMUP_SPACING_MS (derived from
  // POLYGON_FREE_TIER_CALLS_PER_MIN in rate-limit.ts — config, not a magic number),
  // so the bulk recovery never re-creates the storm. Mirrors country/fetch.ts's
  // respectSpacing() closure; the floor is enforced between fetches only.
  let lastRequestAt = 0
  const respectSpacing = async (): Promise<void> => {
    const since = Date.now() - lastRequestAt
    if (since < WARMUP_SPACING_MS) await sleep(WARMUP_SPACING_MS - since)
    lastRequestAt = Date.now()
  }

  // §K Beat 2.6 — "Computing N trades…" counts for the Settings row. tradeCountsByKey
  // is the only keys→trades join (the IPC emitters + renderer never see the keys).
  // Progress now emits PER KEY (was per 50-key chunk) so a paced multi-minute run
  // shows steady movement instead of looking frozen — which would push a user toward
  // the force-refresh footgun that wipes warmup.
  const counts = tradeCountsByKey(keys)
  const tradesTotal = keys.reduce(
    (sum, k) => sum + (counts[`${k.symbol}|${k.date}`] ?? 0),
    0,
  )
  let tradesDone = 0

  let fetched = 0
  let empty = 0
  let errors = 0

  // Flat keys with chunkSize = CHUNK_SIZE: runChunkedBackfill fires onProgress per
  // KEY and the setImmediate yield every CHUNK_SIZE keys (event-loop courtesy).
  await runChunkedBackfill<{ symbol: string; date: string }>({
    items: keys,
    chunkSize: CHUNK_SIZE,
    yieldBetweenChunks: () => new Promise((r) => setImmediate(r)),
    onProgress: ({ item }) => {
      tradesDone += counts[`${item.symbol}|${item.date}`] ?? 0
      opts.onProgress?.({ tradesDone, tradesTotal })
    },
    processItem: async ({ symbol, date }) => {
      const cached = getIntradayRow(symbol, date)
      if (cached === null) {
        // Row vanished between worklist enumeration and processing — only if
        // another path deleted it mid-sweep. Count honestly, skip the upsert.
        errors += 1
        return
      }

      await respectSpacing()
      const attemptedAt = new Date().toISOString()
      let warmupBars: IntradayBar[] = []
      let warmupError: string | null = null
      try {
        // withRateLimitRetry: a 429 backs off (12/30/60s, honors Retry-After) and
        // retries IN-RUN rather than throwing — so a transient throttle no longer
        // strands the key (the §K.1.3 failure mode this beat closes). Belt-and-
        // suspenders behind respectSpacing's proactive floor. Non-429 errors and an
        // exhausted-429 still throw through to the catch → warmup_error stamped, and
        // the §K.1.1 predicate re-enters those (error set) on the next launch.
        warmupBars = await withRateLimitRetry(
          () => fetchWarmupBars(apiKey, symbol, date),
          { sleep },
        )
        if (warmupBars.length === 0) empty += 1
        else fetched += 1
      } catch (err) {
        warmupError = err instanceof Error ? err.message : String(err)
        errors += 1
      }

      upsertIntradayRow({
        symbol,
        date,
        bars: cached.bars, // preserved — warmup never touches the active day
        warmup_bars: warmupBars,
        warmup_attempted_at: attemptedAt,
        warmup_error: warmupError, // §K.1.2 — null on success/empty, message on throw
        fetched_at: cached.fetched_at, // preserved
        error: cached.error, // preserved (always null for eligible keys)
      })
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

import { getSettings } from '../settings/repo'
import {
  extractTickerDetails,
  fetchDailyAggregates,
  fetchTickerReference,
  MassiveError,
} from './massive'
import { withRateLimitRetry, WARMUP_SPACING_MS } from './rate-limit'
import { resolveCountryFromPolygon } from '@/core/country/resolve'
import {
  getMarketRow,
  symbolsNeedingFetch,
  tradeDateRangePerSymbol,
  upsertMarketRow,
  type MarketRow,
} from './repo'
import { backfillAllRvol } from './rvol-backfill'
import type { MarketRefreshProgress } from '@shared/market-types'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const MAX_CONCURRENT = 2
// Fix (c) — pacing + 429 handling are now the SHARED helpers (the warmup-backfill
// model, electron/market/warmup-backfill.ts): respectSpacing paces at
// WARMUP_SPACING_MS (derived from Polygon's 5/min free tier) instead of the old
// ad-hoc 350ms, and every Polygon call is wrapped in withRateLimitRetry (3
// attempts, 12/30/60s backoff, honors Retry-After). The old REQUEST_SPACING_MS
// (~3/s, which blasted the 5/min bucket) + single aggregate-only RETRY_BACKOFF_MS
// retry are gone — that ad-hoc throttle was the cause of the "145 failed" 429 storm.

export interface RefreshResult {
  attempted: number
  fetched: number       // succeeded
  failed: number
  skipped: number       // cached and fresh
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
  cancelled: boolean
}

interface RefreshOptions {
  force?: boolean             // bypass cache
  symbols?: string[]          // limit to these (intersected with trade symbols)
  /** Pushed once per symbol as it completes — drives the renderer loading bar.
   *  Plain callback; the electron `wc.send` wrapping lives in the IPC handler. */
  emitProgress?: (p: MarketRefreshProgress) => void
}

let inFlight: Promise<RefreshResult> | null = null

// Coarse cancel — module flag flipped by cancelMarketRefresh(). The worker
// loop checks it between symbols; the promise still resolves cleanly with
// cancelled:true so the renderer settle chain stays airtight.
let cancelRequested = false

/** Signal the in-flight market refresh to stop starting new symbols. The
 *  refresh promise still resolves (cancelled:true) once in-flight symbols
 *  finish. No-op when nothing is running. */
export function cancelMarketRefresh(): void {
  if (inFlight) cancelRequested = true
}

/** Fetch daily aggregates (date → volume map + avg) for a single symbol
 *  over an explicit date range. Mirrors the aggregates-fetch portion of
 *  runRefresh's fetchOne but as a standalone primitive the import-time
 *  aggregates orchestrator can call without going through the singleton
 *  lock. Does NOT consult cache or staleness — caller owns those. */
export async function fetchAggregatesForSymbol(
  apiKey: string,
  symbol: string,
  from: string,
  to: string,
): Promise<{
  daily_volumes: Record<string, number>
  avg_volume: number | null
  daily_closes: Record<string, number>
}> {
  const aggs = await fetchDailyAggregates(apiKey, symbol, from, to)
  const daily_volumes: Record<string, number> = {}
  const daily_closes: Record<string, number> = {}
  for (const a of aggs) {
    daily_volumes[a.date] = a.volume
    if (a.close !== null) daily_closes[a.date] = a.close
  }
  const avg = aggs.length > 0 ? avgVolume(aggs.map((a) => a.volume)) : null
  return { daily_volumes, avg_volume: avg, daily_closes }
}

// Public entrypoint. Locks behind a singleton promise so concurrent callers
// (manual button + import-time auto-refresh racing) share one run.
export function refreshMarketData(opts: RefreshOptions = {}): Promise<RefreshResult> {
  if (inFlight) return inFlight
  inFlight = runRefresh(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runRefresh(opts: RefreshOptions): Promise<RefreshResult> {
  const startedAt = Date.now()
  cancelRequested = false // reset for this run
  const { polygon_api_key } = getSettings().values

  if (!polygon_api_key) {
    return {
      attempted: 0,
      fetched: 0,
      failed: 0,
      skipped: 0,
      apiKeyMissing: true,
      errors: [],
      durationMs: Date.now() - startedAt,
      cancelled: false,
    }
  }

  const candidates = symbolsNeedingFetch(CACHE_MS, !!opts.force)
  const filter = opts.symbols ? new Set(opts.symbols) : null
  const symbols = filter ? candidates.filter((s) => filter.has(s)) : candidates

  const allSymbolsForLogging = symbols.length
  if (allSymbolsForLogging === 0) {
    return {
      attempted: 0,
      fetched: 0,
      failed: 0,
      skipped: 0,
      apiKeyMissing: false,
      errors: [],
      durationMs: Date.now() - startedAt,
      cancelled: false,
    }
  }

  console.info(
    `[FE market] refresh start: ${allSymbolsForLogging} symbol${allSymbolsForLogging === 1 ? '' : 's'}` +
      `${opts.force ? ' (force)' : ''}`,
  )

  const ranges = tradeDateRangePerSymbol()
  let fetched = 0
  let failed = 0
  const errors: { symbol: string; message: string }[] = []

  let lastRequestAt = 0
  const respectSpacing = async () => {
    const since = Date.now() - lastRequestAt
    if (since < WARMUP_SPACING_MS) {
      await new Promise((r) => setTimeout(r, WARMUP_SPACING_MS - since))
    }
    lastRequestAt = Date.now()
  }

  const fetchOne = async (symbol: string): Promise<void> => {
    const range = ranges.get(symbol)
    const to = range?.to ?? todayISO()
    const from = range
      ? addDays(range.from, -30) // 30-day baseline before the earliest trade
      : addDays(to, -90)

    try {
      await respectSpacing()
      const ref = await withRateLimitRetry(() =>
        fetchTickerReference(polygon_api_key, symbol),
      )
      const details = extractTickerDetails(symbol, ref)
      const country = resolveCountryFromPolygon(ref)

      await respectSpacing()
      const aggs = await withRateLimitRetry(() =>
        fetchDailyAggregates(polygon_api_key, symbol, from, to),
      )

      const dailyVolumes: Record<string, number> = {}
      for (const a of aggs) dailyVolumes[a.date] = a.volume
      const avg = aggs.length > 0 ? avgVolume(aggs.map((a) => a.volume)) : null

      // v0.2.3 Commit B — read the existing row so the refresh path can honor
      // existing-wins for sector/industry. Polygon supplies SIC text, a
      // different taxonomy from the FMP sector Stage A/import wrote; we must
      // never let a refresh overwrite a clean FMP value. (Commit A's COALESCE
      // only stopped null wipes; the success path passed a *non-null* SIC.)
      const existing = getMarketRow(symbol)

      const row: MarketRow = {
        symbol,
        // Commit A: refresh keeps writing Polygon's shares_outstanding into
        // the `float` column (legacy behaviour). Commit B replaces this with
        // an FMP-backed wrapper that writes real float here and the issued
        // count into shares_outstanding. Until then, shares_outstanding is
        // left null on this refresh path.
        float: details.shares_outstanding,
        shares_outstanding: null,
        market_cap: details.market_cap,
        // Existing wins: a refresh re-affirms a present FMP sector or fills one
        // only when the column is empty — Polygon's SIC text never replaces it.
        sector: existing?.sector ?? details.sector ?? null,
        // industry is FMP-only (Polygon has none), so existing always wins:
        // a refresh either re-affirms the imported industry or writes null
        // when there's none yet. Explicit here + COALESCE-guarded in upsert.
        industry: existing?.industry ?? null,
        avg_volume: avg,
        daily_volumes: dailyVolumes,
        country: country.country,
        country_name: country.country_name,
        region: country.region,
        fetched_at: new Date().toISOString(),
        error: null,
      }
      upsertMarketRow(row)
      fetched++
    } catch (e) {
      const message =
        e instanceof MassiveError
          ? `${e.status === 0 ? 'network' : e.status}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e)
      errors.push({ symbol, message })
      failed++
      upsertMarketRow({
        symbol,
        float: null,
        shares_outstanding: null,
        market_cap: null,
        sector: null,
        industry: null,  // COALESCEd in upsert — preserves any prior value
        avg_volume: null,
        daily_volumes: {},
        country: null,
        country_name: null,
        region: null,
        fetched_at: new Date().toISOString(),
        error: message,
      })
      console.info(`[FE market]   ${symbol} failed: ${message}`)
    }
  }

  // Simple promise-pool. Iterates symbols, never more than MAX_CONCURRENT
  // in flight at once.
  const queue = [...symbols]
  let completed = 0
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          if (cancelRequested) return
          const s = queue.shift()
          if (!s) return
          await fetchOne(s)
          completed += 1
          opts.emitProgress?.({ current: completed, total: allSymbolsForLogging, symbol: s })
        }
      })(),
    )
  }
  await Promise.all(workers)

  // v0.2.5 Trader DNA — re-derive RVOL from the now-fresh market_data
  // (daily_volumes / avg_volume). Cache-only + fast, the backfillAllMaeMfe-
  // after-intraday-refresh precedent; skipped on cancel (idempotent next run).
  // Best-effort: the market_data writes already landed, so a re-derive hiccup
  // must NOT fail the refresh (the main/index.ts backfill try/catch posture).
  if (!cancelRequested) {
    try {
      backfillAllRvol()
    } catch (e) {
      console.error(`[FE rvol] re-derive after market refresh failed (non-fatal): ${e}`)
    }
  }

  const result: RefreshResult = {
    attempted: allSymbolsForLogging,
    fetched,
    failed,
    skipped: 0, // candidates were already filtered for staleness above
    apiKeyMissing: false,
    errors,
    durationMs: Date.now() - startedAt,
    cancelled: cancelRequested,
  }
  console.info(
    `[FE market] refresh ${result.cancelled ? 'cancelled' : 'done'}: fetched=${fetched} failed=${failed} in ${result.durationMs}ms`,
  )
  return result
}

function avgVolume(values: number[]): number {
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function todayISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

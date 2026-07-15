import type { IntradayBarsPayload } from '@shared/market-types'
import { getSettings } from '../settings/repo'
import { fetchIntradayMinutes, MassiveError, type IntradayBar } from './massive'
import { getIntradayRow, upsertIntradayRow } from './repo'

interface GetBarsOptions {
  /** Force a fresh fetch even when a cached row exists. */
  force?: boolean
}

// Calendar-day arithmetic on a YYYY-MM-DD string (UTC parts, DST-safe). Kept
// local: the addDays copies in fetch.ts / enrich-aggregates.ts are module-
// private, and the codebase pattern is a per-module copy rather than a shared
// export — so we don't couple this on-demand path to those bulk-import modules.
function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// Warmup window: the 4 calendar days before the active day (date-4 .. date-1).
// Four days covers a Monday's prior Friday plus a single intervening holiday
// without a holiday table — non-trading days in the range simply return no bars.
// Polygon scopes each range bound by ET session date (same as the active-day
// `date/date` call), so no client-side ET split is needed.
export async function fetchWarmupBars(
  apiKey: string,
  symbol: string,
  date: string,
): Promise<IntradayBar[]> {
  return fetchIntradayMinutes(apiKey, symbol, addDays(date, -4), addDays(date, -1))
}

// Per-trade intraday bars on-demand. Reads the cache first; only hits Massive
// when cache is empty OR force=true OR the cached row last errored. The active
// day and the prior-day warmup window are cached together (warmup feeds MACD's
// EMA warmup so the sub-pane renders from the active-day open). Legacy rows
// (cached before the warmup column shipped) have warmup_bars empty and get a
// SILENT backfill on the next access. Warmup failures NEVER surface as an
// error — the error field is reserved for active-day fetch failures.
async function getIntradayBarsInner(
  symbol: string,
  date: string,
  opts: GetBarsOptions = {},
): Promise<IntradayBarsPayload> {
  const cached = getIntradayRow(symbol, date)
  // Aliased conditions (not !!-wrapped) so TS narrows `cached` to non-null
  // inside the branches that test them.
  const haveActive = cached && cached.bars.length > 0 && !cached.error
  const haveWarmup = cached && cached.warmup_bars.length > 0

  // Full hit — active + warmup both cached.
  if (!opts.force && haveActive && haveWarmup) {
    return {
      symbol,
      date,
      bars: cached.bars,
      warmupBars: cached.warmup_bars,
      fetchedAt: cached.fetched_at,
      error: null,
      errorStatus: null,
      justFetched: false,
      apiKeyMissing: false,
    }
  }

  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    // No key — return whatever we have (which may be nothing) and signal so
    // the UI can prompt the user to set it.
    return {
      symbol,
      date,
      bars: cached?.bars ?? [],
      warmupBars: cached?.warmup_bars ?? [],
      fetchedAt: cached?.fetched_at ?? null,
      error: cached?.error ?? null,
      errorStatus: null,
      justFetched: false,
      apiKeyMissing: true,
    }
  }

  // Silent backfill — active bars are cached but warmup is empty (legacy row).
  // Fetch warmup only, write it back alongside the existing active bars, and
  // return the now-complete payload. A warmup failure leaves warmup empty and
  // surfaces NO error (the active-day contract is intact).
  if (!opts.force && haveActive && !haveWarmup) {
    let warmupBars: IntradayBar[] = []
    try {
      warmupBars = await fetchWarmupBars(polygon_api_key, symbol, date)
    } catch {
      warmupBars = []
    }
    upsertIntradayRow({
      symbol,
      date,
      bars: cached.bars,
      warmup_bars: warmupBars,
      fetched_at: cached.fetched_at,
      error: null,
    })
    return {
      symbol,
      date,
      bars: cached.bars,
      warmupBars,
      fetchedAt: cached.fetched_at,
      error: null,
      errorStatus: null,
      justFetched: false,
      apiKeyMissing: false,
    }
  }

  // Full miss or force — fetch the active day AND the warmup window, upsert the
  // union. The active fetch drives error reporting; the warmup fetch is
  // best-effort (swallowed on failure).
  try {
    const bars = await fetchIntradayMinutes(polygon_api_key, symbol, date, date)
    let warmupBars: IntradayBar[] = []
    try {
      warmupBars = await fetchWarmupBars(polygon_api_key, symbol, date)
    } catch {
      warmupBars = []
    }
    const fetchedAt = new Date().toISOString()
    upsertIntradayRow({ symbol, date, bars, warmup_bars: warmupBars, fetched_at: fetchedAt, error: null })
    return {
      symbol,
      date,
      bars,
      warmupBars,
      fetchedAt,
      error: null,
      errorStatus: null,
      justFetched: true,
      apiKeyMissing: false,
    }
  } catch (e) {
    const msg = e instanceof MassiveError ? e.message : (e instanceof Error ? e.message : String(e))
    const status = e instanceof MassiveError ? e.status : null
    const fetchedAt = new Date().toISOString()
    // Persist the error so the bulk refresh's retry logic picks it up. Preserve
    // any cached warmup rather than wiping it on an active-fetch failure.
    upsertIntradayRow({
      symbol,
      date,
      bars: cached?.bars ?? [],
      warmup_bars: cached?.warmup_bars ?? [],
      fetched_at: fetchedAt,
      error: msg,
    })
    return {
      symbol,
      date,
      bars: cached?.bars ?? [],
      warmupBars: cached?.warmup_bars ?? [],
      fetchedAt,
      error: msg,
      errorStatus: status,
      justFetched: false,
      apiKeyMissing: false,
    }
  }
}

/**
 * Public entry point. Calls the inner fetcher, and if the
 * resolved payload is complete (warmup + active bars both
 * present, no error), fires the lazy-guard hook via
 * setImmediate (fire-and-forget; never awaited).
 *
 * The setImmediate defer matches the precedent at
 * electron/main/index.ts:153 (setImmediate(
 * runPendingMaeMfeBackfill)) — keeps the chart-open
 * critical path snappy by yielding to the event loop
 * before the (sync) compute + upsert runs.
 */
export async function getIntradayBars(
  symbol: string,
  date: string,
  opts: GetBarsOptions = {},
): Promise<IntradayBarsPayload> {
  const payload = await getIntradayBarsInner(symbol, date, opts)

  // Fire-and-forget the lazy-guard for complete payloads only.
  // The hook is idempotent and self-gated, but we pre-check
  // here to avoid the import cost in the no-op cases.
  if (
    !payload.error &&
    payload.bars.length > 0 &&
    payload.warmupBars.length > 0
  ) {
    setImmediate(() => {
      // Lazy import to avoid loading the technicals layer on
      // every bars-get call (the hook itself is small but
      // pulls in the pure compute module which transitively
      // touches the charts modules).
      void import('../technicals/lazy-guard')
        .then((m) => m.runLazyGuardForPayload(payload))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[FE technicals] lazy-guard load failed: ${msg}`)
        })
    })
  }

  // (The warmup-blind Entry-vs-9EMA sibling that used to fire here retired in
  // Beat 2 — the lazy-guard above covers the tile column via the technicals
  // dual-write, and only runs when warmup is present, so it can never write a
  // degraded day-only value over a healed one.)
  return payload
}

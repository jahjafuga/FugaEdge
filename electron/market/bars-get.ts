import type { IntradayBarsPayload } from '@shared/market-types'
import { getSettings } from '../settings/repo'
import { fetchIntradayMinutes, MassiveError } from './massive'
import { getIntradayRow, upsertIntradayRow } from './repo'

interface GetBarsOptions {
  /** Force a fresh fetch even when a cached row exists. */
  force?: boolean
}

// Per-trade intraday bars on-demand. Reads the cache first; only hits Massive
// when cache is empty OR force=true OR the cached row last errored. Caches
// successful and failed attempts both — failed cache entries get retried by
// the bulk refresh, not by every modal open.
export async function getIntradayBars(
  symbol: string,
  date: string,
  opts: GetBarsOptions = {},
): Promise<IntradayBarsPayload> {
  const cached = getIntradayRow(symbol, date)
  const haveGoodCache = cached && cached.bars.length > 0 && !cached.error

  if (!opts.force && haveGoodCache) {
    return {
      symbol,
      date,
      bars: cached.bars,
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
      fetchedAt: cached?.fetched_at ?? null,
      error: cached?.error ?? null,
      errorStatus: null,
      justFetched: false,
      apiKeyMissing: true,
    }
  }

  try {
    const bars = await fetchIntradayMinutes(polygon_api_key, symbol, date)
    const fetchedAt = new Date().toISOString()
    upsertIntradayRow({ symbol, date, bars, fetched_at: fetchedAt, error: null })
    return {
      symbol,
      date,
      bars,
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
    // Persist the error so the bulk refresh's retry logic picks it up.
    upsertIntradayRow({
      symbol,
      date,
      bars: cached?.bars ?? [],
      fetched_at: fetchedAt,
      error: msg,
    })
    return {
      symbol,
      date,
      bars: cached?.bars ?? [],
      fetchedAt,
      error: msg,
      errorStatus: status,
      justFetched: false,
      apiKeyMissing: false,
    }
  }
}

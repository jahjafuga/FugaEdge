import { getSettings } from '../settings/repo'
import {
  extractTickerDetails,
  fetchDailyAggregates,
  fetchTickerReference,
  MassiveError,
} from './massive'
import { resolveCountryFromPolygon } from '@/core/country/resolve'
import {
  symbolsNeedingFetch,
  tradeDateRangePerSymbol,
  upsertMarketRow,
  type MarketRow,
} from './repo'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const REQUEST_SPACING_MS = 350             // floor between requests (~3/s)
const MAX_CONCURRENT = 2
const RETRY_BACKOFF_MS = 12_000            // on 429

export interface RefreshResult {
  attempted: number
  fetched: number       // succeeded
  failed: number
  skipped: number       // cached and fresh
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
}

interface RefreshOptions {
  force?: boolean             // bypass cache
  symbols?: string[]          // limit to these (intersected with trade symbols)
}

let inFlight: Promise<RefreshResult> | null = null

/** Fetch shares_outstanding (float) for a single symbol via Polygon's
 *  /v3/reference/tickers endpoint. Returns null when Polygon has no
 *  shares_outstanding value on the ticker (delisted, non-equity, etc.).
 *
 *  Does NOT consult cache, staleness, or singleton lock — caller is
 *  responsible for upserting onto market_data and for any caching
 *  policy. Used by the import-time float orchestrator (which passes an
 *  EXPLICIT symbol list it has already decided needs a fetch); runRefresh
 *  keeps its own internal path that bundles reference + aggregates
 *  together for the Settings → Refresh Market Data flow. */
export async function fetchFloatForSymbol(
  apiKey: string,
  symbol: string,
): Promise<number | null> {
  const ref = await fetchTickerReference(apiKey, symbol)
  const details = extractTickerDetails(symbol, ref)
  return details.shares_outstanding
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
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
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
      const ref = await fetchTickerReference(polygon_api_key, symbol)
      const details = extractTickerDetails(symbol, ref)
      const country = resolveCountryFromPolygon(ref)

      await respectSpacing()
      let aggs
      try {
        aggs = await fetchDailyAggregates(polygon_api_key, symbol, from, to)
      } catch (e) {
        if (e instanceof MassiveError && e.status === 429) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
          aggs = await fetchDailyAggregates(polygon_api_key, symbol, from, to)
        } else {
          throw e
        }
      }

      const dailyVolumes: Record<string, number> = {}
      for (const a of aggs) dailyVolumes[a.date] = a.volume
      const avg = aggs.length > 0 ? avgVolume(aggs.map((a) => a.volume)) : null

      const row: MarketRow = {
        symbol,
        float: details.shares_outstanding,
        market_cap: details.market_cap,
        sector: details.sector,
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
        market_cap: null,
        sector: null,
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
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const s = queue.shift()
          if (!s) return
          await fetchOne(s)
        }
      })(),
    )
  }
  await Promise.all(workers)

  const result: RefreshResult = {
    attempted: allSymbolsForLogging,
    fetched,
    failed,
    skipped: 0, // candidates were already filtered for staleness above
    apiKeyMissing: false,
    errors,
    durationMs: Date.now() - startedAt,
  }
  console.info(
    `[FE market] refresh done: fetched=${fetched} failed=${failed} in ${result.durationMs}ms`,
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

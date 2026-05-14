// Massive.com REST client.
//
// Endpoint paths and parameter names are pulled verbatim from the official
// Massive REST docs (https://massive.com/docs/rest/llms.txt):
//   - GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}
//   - GET /v3/reference/tickers/{ticker}
//   - GET /v1/indicators/ema/{stockTicker}
//   - GET /stocks/vX/float
//
// Auth: API key passed as `apiKey=...` query param. Same convention the
// docs use in every sample URL.
//
// IMPORTANT: never log the full request URL — the API key sits in the query
// string. We log just the path.

const BASE_URL = 'https://api.massive.com'

export class MassiveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message)
    this.name = 'MassiveError'
  }
}

async function massiveGet<T>(apiKey: string, path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(apiKey)}`
  let res: Response
  try {
    res = await fetch(url, { method: 'GET' })
  } catch (e) {
    throw new MassiveError(
      `Network error: ${e instanceof Error ? e.message : String(e)}`,
      0,
      path,
    )
  }
  if (!res.ok) {
    let body = ''
    try {
      body = await res.text()
    } catch {
      // ignore
    }
    throw new MassiveError(
      `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 180)}` : ''}`,
      res.status,
      path,
    )
  }
  return (await res.json()) as T
}

// ── /v3/reference/tickers/{ticker} ──────────────────────────────────────────
//
// Two layers:
//   - fetchTickerReference returns the raw, lightly-typed body. Country
//     resolution (and any future caller that needs name/description/locale)
//     reads from this.
//   - fetchTickerDetails wraps the raw call and extracts the float / market
//     cap / sector fields the market_data table actually persists.

interface MassiveTickerResp {
  status?: string
  results?: {
    ticker?: string
    name?: string
    market?: string
    locale?: string
    primary_exchange?: string
    address?: { country?: string }
    description?: string
    share_class_shares_outstanding?: number
    weighted_shares_outstanding?: number
    market_cap?: number
    sic_description?: string
  }
}

/** Raw shape consumed by resolveCountryFromPolygon — kept loose so the
 *  pure resolver doesn't depend on the full Polygon response type. */
export type TickerReference = MassiveTickerResp

export async function fetchTickerReference(
  apiKey: string,
  symbol: string,
): Promise<TickerReference> {
  const path = `/v3/reference/tickers/${encodeURIComponent(symbol)}`
  return massiveGet<MassiveTickerResp>(apiKey, path)
}

export interface TickerDetails {
  symbol: string
  shares_outstanding: number | null
  market_cap: number | null
  sector: string | null
}

export async function fetchTickerDetails(
  apiKey: string,
  symbol: string,
): Promise<TickerDetails> {
  const data = await fetchTickerReference(apiKey, symbol)
  return extractTickerDetails(symbol, data)
}

export function extractTickerDetails(
  symbol: string,
  data: TickerReference,
): TickerDetails {
  const r = data.results ?? {}
  return {
    symbol,
    shares_outstanding:
      typeof r.share_class_shares_outstanding === 'number'
        ? r.share_class_shares_outstanding
        : typeof r.weighted_shares_outstanding === 'number'
          ? r.weighted_shares_outstanding
          : null,
    market_cap: typeof r.market_cap === 'number' ? r.market_cap : null,
    sector: r.sic_description ?? null,
  }
}

// ── /stocks/vX/float ───────────────────────────────────────────────────────
//
// Massive's dedicated free-float endpoint. Returns the actual tradable share
// count rather than the share-class outstanding figure on /v3/reference. Use
// this when you want the "real" float for a momentum signal.

interface MassiveFloatResp {
  status?: string
  results?: {
    ticker: string
    free_float: number
    free_float_percent?: number
    effective_date?: string
  }[]
}

export interface FreeFloat {
  symbol: string
  free_float: number | null
  free_float_percent: number | null
  effective_date: string | null
}

export async function fetchFreeFloat(
  apiKey: string,
  symbol: string,
): Promise<FreeFloat> {
  const path = `/stocks/vX/float?ticker=${encodeURIComponent(symbol)}&limit=1`
  const data = await massiveGet<MassiveFloatResp>(apiKey, path)
  const r = data.results?.[0]
  if (!r) {
    return {
      symbol,
      free_float: null,
      free_float_percent: null,
      effective_date: null,
    }
  }
  return {
    symbol,
    free_float: typeof r.free_float === 'number' ? r.free_float : null,
    free_float_percent:
      typeof r.free_float_percent === 'number' ? r.free_float_percent : null,
    effective_date: r.effective_date ?? null,
  }
}

// ── /v2/aggs/ticker/{symbol}/range/1/day/{from}/{to} ───────────────────────

interface MassiveAggsResp {
  status?: string
  resultsCount?: number
  results?: {
    t: number  // ms timestamp at start of bar (UTC)
    o?: number
    h?: number
    l?: number
    c?: number
    v?: number
  }[]
}

export interface DailyAggregate {
  date: string  // YYYY-MM-DD
  volume: number
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function dateFromMs(ms: number): string {
  const d = new Date(ms)
  // Massive timestamps mark the start of the trading day. Use UTC parts so
  // we don't drift across the local-time DST boundary.
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export async function fetchDailyAggregates(
  apiKey: string,
  symbol: string,
  from: string,   // YYYY-MM-DD inclusive
  to: string,     // YYYY-MM-DD inclusive
): Promise<DailyAggregate[]> {
  const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`
  const data = await massiveGet<MassiveAggsResp>(apiKey, path)
  const out: DailyAggregate[] = []
  for (const bar of data.results ?? []) {
    if (typeof bar.t !== 'number' || typeof bar.v !== 'number') continue
    out.push({ date: dateFromMs(bar.t), volume: bar.v })
  }
  return out
}

// ── 1-minute intraday bars ─────────────────────────────────────────────────

export interface IntradayBar {
  t: number  // epoch ms at bar start (UTC)
  o: number
  h: number
  l: number
  c: number
  v: number
}

export async function fetchIntradayMinutes(
  apiKey: string,
  symbol: string,
  date: string,   // YYYY-MM-DD, fetched as a single-day range
): Promise<IntradayBar[]> {
  const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${date}/${date}?adjusted=true&sort=asc&limit=50000`
  const data = await massiveGet<MassiveAggsResp>(apiKey, path)
  const out: IntradayBar[] = []
  for (const bar of data.results ?? []) {
    if (
      typeof bar.t !== 'number' ||
      typeof bar.c !== 'number' ||
      typeof bar.o !== 'number'
    ) continue
    out.push({
      t: bar.t,
      o: bar.o,
      h: bar.h ?? bar.c,
      l: bar.l ?? bar.c,
      c: bar.c,
      v: bar.v ?? 0,
    })
  }
  return out
}

// ── /v1/indicators/ema/{symbol} ────────────────────────────────────────────
//
// Massive's server-side EMA endpoint. We keep our local SMA-seeded EMA as
// the default for trade-entry distance (it computes off cached 1-minute
// bars without an extra API request) but expose this so callers that want
// an authoritative EMA series — e.g. a future indicator overlay on the
// per-trade chart — can pull it directly.

interface MassiveEmaResp {
  status?: string
  results?: {
    values?: { timestamp: number; value: number }[]
  }
}

export interface EmaSample {
  timestamp: number  // epoch ms
  value: number
}

export interface FetchEmaOptions {
  /** "minute", "hour", "day", etc. Maps to the API's `timespan` parameter. */
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month'
  /** EMA period (e.g. 9 for the 9-EMA most momentum traders watch). */
  window: number
  /** Which bar field the EMA is calculated on. Default close. */
  series_type?: 'close' | 'open' | 'high' | 'low'
  /** Optional date filter (YYYY-MM-DD or ms). Limits the series to that day. */
  timestamp?: string | number
  /** Max samples returned. Default 10, max 5000 per docs. */
  limit?: number
}

export async function fetchExponentialMovingAverage(
  apiKey: string,
  symbol: string,
  opts: FetchEmaOptions,
): Promise<EmaSample[]> {
  const params = new URLSearchParams()
  params.set('timespan', opts.timespan)
  params.set('window', String(opts.window))
  params.set('series_type', opts.series_type ?? 'close')
  if (opts.timestamp !== undefined) {
    params.set('timestamp', String(opts.timestamp))
  }
  if (typeof opts.limit === 'number') {
    params.set('limit', String(opts.limit))
  }
  const path = `/v1/indicators/ema/${encodeURIComponent(symbol)}?${params.toString()}`
  const data = await massiveGet<MassiveEmaResp>(apiKey, path)
  const out: EmaSample[] = []
  for (const v of data.results?.values ?? []) {
    if (typeof v.timestamp !== 'number' || typeof v.value !== 'number') continue
    out.push({ timestamp: v.timestamp, value: v.value })
  }
  return out
}

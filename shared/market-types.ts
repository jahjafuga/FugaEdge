export interface MarketRefreshResult {
  attempted: number
  fetched: number
  failed: number
  skipped: number
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
}

export interface IntradayRefreshResult {
  attempted: number
  fetched: number
  failed: number
  apiKeyMissing: boolean
  errors: { symbol: string; date: string; message: string }[]
  emaBackfilled: number
  maeMfeBackfilled: number
  durationMs: number
}

// Single-trade intraday lookup — backs the per-trade Chart tab.
export interface IntradayBar {
  t: number  // epoch ms (UTC) at bar start
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface IntradayBarsPayload {
  symbol: string
  date: string
  /** Empty when the (symbol, date) row has no cached bars and force=false. */
  bars: IntradayBar[]
  /** ISO timestamp when the bars were fetched. Null when never fetched. */
  fetchedAt: string | null
  /** Last error if the most recent fetch attempt failed; null on success. */
  error: string | null
  /** True when the data was just freshly fetched (vs read from cache). */
  justFetched: boolean
  /** True when the user has no Massive API key configured and we have no cache. */
  apiKeyMissing: boolean
}

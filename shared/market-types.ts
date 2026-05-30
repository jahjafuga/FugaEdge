// Live per-item progress pushed main→renderer while a refresh runs, so the UI
// can show a loading bar instead of a dead greyed-out button. `date` is set for
// intraday (symbol, date) pairs and omitted for the per-symbol market refresh.
export interface MarketRefreshProgress {
  current: number
  total: number
  symbol: string
  date?: string
}

export interface MarketRefreshResult {
  attempted: number
  fetched: number
  failed: number
  skipped: number
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
  /** True when the user clicked Cancel; the run still resolved cleanly (no
   *  throw) with partial counts and any already-fetched pairs kept. */
  cancelled: boolean
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
  /** True when the user clicked Cancel; the run still resolved cleanly (no
   *  throw) with partial counts and any already-fetched pairs kept. */
  cancelled: boolean
}

// v0.2.2 — standalone float backfill (Settings → Data backfill, "Backfill
// float" button). Independent of the country backfill: different API (FMP, not
// Massive/Polygon), different rate limits, separate trigger + progress + result.
export interface FloatBackfillProgress {
  current: number
  total: number
  symbol: string
}

export interface FloatBackfillResult {
  /** Distinct symbols that had a null-float trade and were attempted. */
  attempted: number
  /** Symbols whose float is now populated (no longer null). */
  filled: number
  /** Symbols still null after the run — FMP has no float (LABT-style) or a
   *  transient failure. Count mirrors unavailableSymbols.length. */
  unavailable: number
  /** The named still-null symbols, so the user knows which to fill manually. */
  unavailableSymbols: string[]
  /** True when no FMP key is configured — nothing was fetched. */
  apiKeyMissing: boolean
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
  /** HTTP status on the last failed fetch, when available. 403 indicates a
   *  plan-restriction error from Polygon (renderer shows a clean upgrade
   *  prompt instead of the raw JSON). Null when no upstream HTTP exchange
   *  occurred (network error, cache hit, etc.). */
  errorStatus: number | null
  /** True when the data was just freshly fetched (vs read from cache). */
  justFetched: boolean
  /** True when the user has no Massive API key configured and we have no cache. */
  apiKeyMissing: boolean
}

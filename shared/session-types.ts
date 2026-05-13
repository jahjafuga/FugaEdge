// Per-day session metadata. Holds the market-sentiment rating the trader
// assigns to the session as a whole + an optional "no-trade day" flag so
// the trader can log "I sat out today" with context. One row per
// YYYY-MM-DD.

export interface SessionMeta {
  date: string                  // YYYY-MM-DD
  sentiment: number | null      // 1..5 or null
  notes: string
  no_trade_day: boolean         // true when the trader explicitly sat out
  no_trade_reason: string       // free-form reason; empty when not a no-trade day
}

export interface SaveSentimentInput {
  date: string
  sentiment: number | null
}

/** Combined save for the Today's Session card. Either or both of
 *  sentiment / no-trade-day can be set in one round-trip. */
export interface SaveTodaySessionInput {
  date: string                   // YYYY-MM-DD
  sentiment: number | null
  no_trade_day: boolean
  no_trade_reason: string
}

/**
 * Stable labels for each sentiment level. Mirrors the spec; matches
 * momentum-trading vocabulary about how many "runner" stocks the market
 * produced for the day. A lower number = more / hotter runners (better
 * environment for momentum entries); a higher number = thin tape.
 */
export const SENTIMENT_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '3+ stocks >100%',
  2: '2 stocks >100%',
  3: '1 stock >100%',
  4: '1 stock >50%',
  5: '0 stocks >50%',
}

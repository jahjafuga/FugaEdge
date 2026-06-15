// v0.2.5 EdgeIQ Trader DNA — daily % change derivation (the "up X% on the day"
// selection pillar). PURE per ARCHITECTURE rule #1: zero electron/fs/sqlite/React
// imports, so it runs identically in the import enrichment, the backfill, and a
// future web target. Both the electron write paths feed it plain numbers.
//
// Definition (founder-locked): AT-ENTRY — the % the stock was up/down vs the
// PRIOR session's close at the moment of entry:
//   dailyChangePct = (entryPrice − prevClose) / prevClose × 100
// This is the most faithful to "was it up ≥X% WHEN I entered" (a scan criterion),
// rather than the close-based whole-day move which can diverge wildly intraday.

export interface DailyBar {
  /** YYYY-MM-DD (a trading day). */
  date: string
  close: number
}

/** The minimal per-trade shape the derivation needs: entry price is by side
 *  (long enters on the buy, short enters on the sell). */
export interface DailyChangeTrade {
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  date: string
}

/** The close of the trading day immediately BEFORE `date` — the last bar whose
 *  date is strictly less than `date`. Null when no prior bar exists (the trade
 *  day is the earliest bar, or predates the range). Trading-day aware by
 *  construction: the bars contain only trading days, so a Monday trade resolves
 *  to Friday's close (the weekend has no bars). Scans for the max date < target,
 *  so it's correct even if the input isn't perfectly sorted. */
export function prevCloseFor(date: string, sortedBars: DailyBar[]): number | null {
  let prevDate: string | null = null
  let prevClose: number | null = null
  for (const bar of sortedBars) {
    if (bar.date < date && (prevDate === null || bar.date > prevDate)) {
      prevDate = bar.date
      prevClose = bar.close
    }
  }
  return prevClose
}

/** (entryPrice − prevClose) / prevClose × 100. Null when uncomputable —
 *  prevClose ≤ 0 or any non-finite input — so callers store NULL ("not
 *  computed"), never a fabricated number (the no-fake law). */
export function dailyChangePct(entryPrice: number, prevClose: number): number | null {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(prevClose) || prevClose <= 0) {
    return null
  }
  return ((entryPrice - prevClose) / prevClose) * 100
}

/** End-to-end per-trade derivation, shared by the backfill + the import-time
 *  fill: by-side entry price → prior close → at-entry %. Null when there's no
 *  prior bar (or the math is uncomputable) — stored honestly as "unknown". */
export function dailyChangeForTrade(t: DailyChangeTrade, sortedBars: DailyBar[]): number | null {
  const entry = t.side === 'long' ? t.avg_buy_price : t.avg_sell_price
  const prevClose = prevCloseFor(t.date, sortedBars)
  return prevClose === null ? null : dailyChangePct(entry, prevClose)
}

// Pure trip-provenance predicate — no electron / fs imports (ARCHITECTURE rule
// #1), so it is importable by BOTH the electron analytics/reports layer (which
// already imports the SQL snippets from ./outcome) and the renderer performance
// / insights / technicals layer.
//
// A summary trip (source_format === 'summary', set by the TradeZero daily-summary
// parser in Phase 1) carries NO real fill times: its open_time/close_time are a
// single nominal 09:30 ET anchor (a 0-second "hold"). Its P&L, shares, and fees
// are REAL and must count in every aggregate — totals, win rate, per-symbol,
// per-day, expectancy, calendar, and the non-hour Compare dimensions. But its
// fabricated timestamp must be excluded from time-of-day analytics so it can't
// invent a 9:30 entry peak in the "best hour" stats.
//
// Time-of-day sites key the exclusion on THIS predicate, NEVER on the
// open_time === close_time heuristic — a real scalp can legitimately open and
// close in the same second and must not be dropped from the hour buckets.
export function isSummaryTrip(t: { source_format?: string | null }): boolean {
  return t.source_format === 'summary'
}

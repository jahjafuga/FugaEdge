import Papa from 'papaparse'

export type CsvFormat =
  | 'executions'
  | 'tradehistory'
  | 'trades_window'
  | 'webull_mobile'
  | 'daily-summary'
  | 'tradezero'
  | 'unknown'

// Sniffs the first row(s) to decide which DAS Trader export this is.
// We parse via PapaParse so quoted multi-line cells (which DAS uses for the
// daily-summary's "Bought\nShares" style headers) don't get cut off mid-row.
export function detectFormat(csvText: string): CsvFormat {
  const stripped = csvText.replace(/^[﻿￾​]+/, '')

  const sniff = Papa.parse<string[]>(stripped, {
    header: false,
    skipEmptyLines: true,
    delimiter: ',',
    preview: 2,
  })

  const rows = sniff.data
  if (rows.length === 0) return 'unknown'
  const row1 = rows[0]
  if (!row1 || row1.length === 0) return 'unknown'

  const first = (row1[0] || '').trim().toLowerCase()
  const normalizedHeaders = row1.map((c) => (c || '').trim().toLowerCase())
  const has = (h: string) => normalizedHeaders.includes(h)

  // Executions file (Trades.csv) — first column is TradeID.
  if (first === 'tradeid') return 'executions'

  // TradeHistory / DAS Trades window export (tradehistory variant) — first column
  // is Date, separate Time + Symbol + Side + Quantity + Price columns.
  // Header check is strict enough to avoid colliding with other date-first
  // formats we might encounter later (e.g. Webull mobile, which starts
  // with a "Name" or "Filled Time" column, not "Date").
  if (
    first === 'date' &&
    has('time') &&
    has('symbol') &&
    has('side') &&
    (has('quantity') || has('qty')) &&
    has('price')
  ) {
    return 'tradehistory'
  }

  // DAS Trades window export (trades_window variant) — first column is Time,
  // bare HH:MM:SS without a date prefix. Cloid is the distinctive header
  // that disambiguates this from a hypothetical "Time"-led Webull export.
  if (
    first === 'time' &&
    has('symbol') &&
    has('side') &&
    has('price') &&
    (has('qty') || has('quantity')) &&
    has('cloid')
  ) {
    return 'trades_window'
  }

  // Webull Mobile export — first column is "Name" (full company name).
  // No DAS shape starts with Name. We pair the first-column check with
  // two distinctive Webull headers ("Filled Time" — hyphen-free, distinct
  // from DAS's "Time" — and "Time-in-Force") so a future broker that
  // happens to lead with a Name column won't false-match.
  if (
    first === 'name' &&
    has('filled time') &&
    has('time-in-force')
  ) {
    return 'webull_mobile'
  }

  // TradeZero execution export — first column is "Account". No DAS/Webull shape
  // leads with Account; pair the first-column check with two TradeZero-
  // distinctive headers ("T/D" trade-date and "Exec Time") so an unrelated
  // Account-led export can't false-match.
  if (first === 'account' && has('t/d') && has('exec time')) {
    return 'tradezero'
  }

  // Daily summary — first column is Symbol. Verify with fee/aggregate markers
  // in either row 1 (single-line or embedded-newline headers) or row 2
  // (continuation row when headers physically span two lines).
  if (first === 'symbol') {
    const joined1 = row1
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
    const joined2 = rows[1]
      ? rows[1].join(' ').toLowerCase().replace(/\s+/g, ' ')
      : ''
    const combined = `${joined1} ${joined2}`
    if (
      combined.includes('htb') ||
      combined.includes('day-trade') ||
      combined.includes('finra') ||
      combined.includes(' ecn ')
    ) {
      return 'daily-summary'
    }
    // "Symbol" as the first column is distinctive enough — fall through as
    // daily-summary even without the fee markers (e.g. exports that strip
    // them).
    return 'daily-summary'
  }

  // Older / variant exports that don't start with TradeID/Symbol — fall back
  // to the substring sniff on the joined first row.
  const joined1 = row1.join(' ').toLowerCase()
  if (joined1.includes('tradeid') && joined1.includes('b/s')) return 'executions'
  if (joined1.includes('htb') || joined1.includes('day-trade')) return 'daily-summary'

  return 'unknown'
}

// v0.2.7 Feature 4 — THE trades-table column-visibility preference. One module,
// one key, one mechanism.
//
// WHAT THIS REPLACES. Visibility was persisted in four separate localStorage keys
// (sparkline in its own prefs module, country/catalyst/mistakes inline in
// Trades.tsx), each read in a useState initialiser, written back in a useEffect, and
// threaded down as a boolean prop that the table used to SPLICE its column array.
// Five places to look, and the props could disagree with the table's own state.
//
// Now: TanStack owns visibility, this module owns persistence, and the column array
// is a fixed registry that never changes shape. localStorage rather than the settings
// table because that is where this concern already lived — and because a DB-backed
// read would inherit the useDnaConfig staleness bug, which for a toggle the user just
// clicked would be a visible defect.

/** TanStack's VisibilityState shape: absent means visible. */
export type ColumnVisibility = Record<string, boolean>

export const COLUMN_PREFS_KEY = 'fuga.trades.columnVisibility'

/** The column the table cannot function without — you cannot tell rows apart. */
export const UNHIDEABLE_COLUMN = 'symbol'

/** The columns pinned to the left edge, in render order.
 *
 *  Once every column carries a real width the table is wider than its container
 *  and scrolls sideways — and the two columns that say WHICH TRADE a row is are
 *  the first to leave the screen, so you end up reading numbers with nothing to
 *  attach them to. These stay put.
 *
 *  Pinned implies unhideable: a pinned column that could be switched off would
 *  leave a sticky gap where nothing renders. */
export const PINNED_COLUMNS = ['open_time', 'symbol'] as const

/** True when the column may never be hidden — the pinned pair, plus the symbol
 *  that has always been unhideable because rows cannot be told apart without it. */
export function isLockedColumn(id: string): boolean {
  return id === UNHIDEABLE_COLUMN || (PINNED_COLUMNS as readonly string[]).includes(id)
}

/** Every column the registry can render, in render order. */
export const ALL_COLUMN_IDS = [
  'open_time', 'open', 'close', 'symbol', 'playbook', 'country', 'catalyst',
  'mistakes', 'side', 'shares', 'avg_buy', 'avg_sell', 'float', 'net_pnl', 'fees',
  'spark',
  // v0.2.7 additions — all default hidden.
  'hold_time', 'price_move_pct', 'pnl_gain_pct', 'exec_count', 'first_entry',
  'stop_price', 'r_multiple', 'risk_per_share', 'total_risk', 'rvol',
  'daily_change_pct', 'confidence', 'entry_timeframe', 'days_since_catalyst',
  'mae', 'mfe', 'stop_source',
] as const

/** What a fresh install shows. Mirrors the pre-v0.2.7 defaults exactly: country on,
 *  catalyst / mistakes / float / sparkline off, everything else on. */
export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  catalyst: false,
  mistakes: false,
  float: false,
  spark: false,
  hold_time: false,
  price_move_pct: false,
  pnl_gain_pct: false,
  exec_count: false,
  first_entry: false,
  stop_price: false,
  r_multiple: false,
  risk_per_share: false,
  total_risk: false,
  rvol: false,
  daily_change_pct: false,
  confidence: false,
  entry_timeframe: false,
  days_since_catalyst: false,
  mae: false,
  market_cap: false,
  vwap_dist_pct: false,
  ema9_dist_pct: false,
  mfe: false,
  stop_source: false,
}

/** The human label for every column — ONE source, read by the table registry's meta
 *  and by the filter bar's range inputs, so a column cannot be named one thing where
 *  you toggle it and another where you filter it. */
export const COLUMN_LABELS: Record<string, string> = {
  open_time: 'Date', open: 'Open', close: 'Close', symbol: 'Symbol',
  playbook: 'Playbook', country: 'Country', catalyst: 'Catalyst',
  mistakes: 'Mistakes', side: 'Side', shares: 'Shares', avg_buy: 'Buy avg',
  avg_sell: 'Sell avg', float: 'Float', net_pnl: 'Net P&L', fees: 'Fees',
  spark: 'Chart', hold_time: 'Hold time', price_move_pct: 'Price move %',
  pnl_gain_pct: 'Gain %', exec_count: 'Fills', first_entry: 'First entry',
  stop_price: 'Stop price', r_multiple: 'R multiple',
  risk_per_share: 'Risk / share', total_risk: 'Total risk', rvol: 'RVOL',
  daily_change_pct: 'Day change %', confidence: 'Confidence',
  entry_timeframe: 'Timeframe', days_since_catalyst: 'Catalyst age',
  mae: 'MAE', mfe: 'MFE', stop_source: 'Stop set by',
  // "(latest)" is load-bearing: market_data is a per-symbol snapshot, so this
  // is the cap at the last refresh, not on the day of the trade.
  market_cap: 'Mkt cap (latest)',
  vwap_dist_pct: 'VWAP dist %',
  ema9_dist_pct: 'EMA9 dist %',
}

/** Rendered width in px, one entry per column id. The table is `tableLayout:
 *  fixed`, so these ARE the column widths — nothing is measured from content.
 *
 *  DERIVED, not chosen: max(header chars x 7.5, longest formatter output x 7.2)
 *  + 24px of cell padding, rounded up to 5. Header type is 10px semibold with
 *  wide tracking; values are 12px monospace.
 *
 *  DERIVATION MISS, corrected: a handful of columns were pinned to the width they
 *  already had rather than run through the formula, and Country's 65 was one of
 *  them — its own label needs 77. Every override is now checked against its label
 *  too, and a test walks all 33 so the next one cannot slip through.
 *
 *  Before this existed the table sized 33 columns from a 15-key map, so every
 *  v0.2.7 addition rendered at "whatever Shares is", and Chart declared ONE pixel
 *  while its sparkline draws eighty — which is how it painted across its
 *  neighbour. */
export const COLUMN_WIDTHS: Record<string, number> = {
  // text, width set by the content they truncate
  open_time: 110, open: 85, close: 85, symbol: 80, playbook: 130,
  country: 80, catalyst: 130, mistakes: 150, side: 60,
  spark: 105, // the Sparkline's own 80px + 24px padding
  // numeric, width set by the wider of the label and the worst-case value
  shares: 90, avg_buy: 90, avg_sell: 90, float: 65, net_pnl: 105, fees: 90,
  hold_time: 95, price_move_pct: 115, pnl_gain_pct: 85, exec_count: 65,
  first_entry: 110, stop_price: 100, stop_source: 110, r_multiple: 100,
  risk_per_share: 115, total_risk: 100, rvol: 70, daily_change_pct: 115,
  confidence: 100, entry_timeframe: 95, days_since_catalyst: 115,
  mae: 100, mfe: 90, market_cap: 120, vwap_dist_pct: 110, ema9_dist_pct: 110,
}

/** Columns a min/max range can filter on. Exactly the ids rangeValueOf resolves —
 *  T30 asserts the two agree, so a numeric column cannot be added to the table and
 *  quietly left unreachable from the filter bar. */
export const NUMERIC_COLUMN_IDS = [
  'shares', 'avg_buy', 'avg_sell', 'fees', 'net_pnl', 'float',
  'hold_time', 'price_move_pct', 'pnl_gain_pct', 'exec_count', 'first_entry',
  'stop_price', 'r_multiple', 'risk_per_share', 'total_risk', 'rvol',
  'daily_change_pct', 'confidence', 'days_since_catalyst', 'mae', 'mfe',
  'market_cap', 'vwap_dist_pct', 'ema9_dist_pct',
] as const

/** True when the column is currently shown (absent means visible, TanStack's rule). */
export function isVisible(v: ColumnVisibility, id: string): boolean {
  return v[id] !== false
}

// The four keys this module folds in. Read ONCE, when the new key is absent, so a
// user's existing toggles survive the change rather than silently resetting.
const LEGACY = [
  { key: 'fuga.trades.showSparkline', column: 'spark' },
  { key: 'trades.showCountryColumn', column: 'country' },
  { key: 'trades.showCatalystColumn', column: 'catalyst' },
  { key: 'trades.showMistakesColumn', column: 'mistakes' },
] as const

function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

/** Symbol is forced visible on every read and write — a persisted `false` from a
 *  hand-edited store cannot brick the table. */
function pinUnhideable(v: ColumnVisibility): ColumnVisibility {
  const pinned = Object.fromEntries(PINNED_COLUMNS.map((id) => [id, true]))
  return { ...v, ...pinned, [UNHIDEABLE_COLUMN]: true }
}

export function readColumnVisibility(): ColumnVisibility {
  const s = storage()
  if (!s) return pinUnhideable({ ...DEFAULT_COLUMN_VISIBILITY })
  const raw = s.getItem(COLUMN_PREFS_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return pinUnhideable({ ...DEFAULT_COLUMN_VISIBILITY, ...parsed })
      }
    } catch {
      // fall through to the legacy fold / defaults
    }
  }
  // One-time fold of the pre-v0.2.7 keys. Honouring them rather than defaulting:
  // silently resetting toggles a user had already set is a small data loss, and the
  // values are trivially recoverable here.
  const folded: ColumnVisibility = { ...DEFAULT_COLUMN_VISIBILITY }
  let found = false
  for (const { key, column } of LEGACY) {
    const v = s.getItem(key)
    if (v === '1' || v === '0') {
      folded[column] = v === '1'
      found = true
    }
  }
  return pinUnhideable(found ? folded : { ...DEFAULT_COLUMN_VISIBILITY })
}

export function writeColumnVisibility(v: ColumnVisibility): void {
  const s = storage()
  if (!s) return
  s.setItem(COLUMN_PREFS_KEY, JSON.stringify(pinUnhideable(v)))
}

/** Back to the shipped defaults, from ANY state. */
export function resetColumnVisibility(): ColumnVisibility {
  const next = pinUnhideable({ ...DEFAULT_COLUMN_VISIBILITY })
  writeColumnVisibility(next)
  return next
}

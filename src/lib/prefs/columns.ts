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

/** Every column the registry can render, in render order. */
export const ALL_COLUMN_IDS = [
  'open_time', 'open', 'close', 'symbol', 'playbook', 'country', 'catalyst',
  'mistakes', 'side', 'shares', 'avg_buy', 'avg_sell', 'float', 'net_pnl', 'fees',
  'spark',
  // v0.2.7 additions — all default hidden.
  'hold_time', 'price_move_pct', 'pnl_gain_pct', 'exec_count', 'first_entry',
  'stop_price', 'r_multiple', 'risk_per_share', 'total_risk', 'rvol',
  'daily_change_pct', 'confidence', 'entry_timeframe', 'days_since_catalyst',
  'mae', 'mfe',
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
  mfe: false,
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
  return { ...v, [UNHIDEABLE_COLUMN]: true }
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

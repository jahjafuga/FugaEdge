import type { RoundTripExecution } from './import-types'
import type { PlaybookTier } from './playbook-types'

export interface TradeNote {
  text: string
}

export type EntryTimeframe = '10s' | '1m' | '5m'

export interface TradeListRow {
  id: number
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  is_open: boolean
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  gross_pnl: number
  total_fees: number
  /** Ocean One's separate Comm — a display slice of total_fees (already folded
   *  in, NOT additive). Undefined/absent when the broker reported no separate
   *  commission (DAS/Webull and all pre-3c rows). Stored + typed now; a later
   *  beat surfaces it in the trade UI. */
  commission?: number
  net_pnl: number
  executions: RoundTripExecution[]
  note: TradeNote | null
  entry_timeframe: EntryTimeframe | null
  entry_ema9_distance_pct: number | null
  /** Max adverse / favorable excursion in $/share between entry and exit,
   *  backfilled from intraday_bars (computeMaeMfe). Both >= 0; null when no
   *  intraday bars cover the trade's window. */
  mae: number | null
  mfe: number | null
  playbook_id: number | null
  playbook_name: string | null
  /** Quality tier of the trade's playbook, joined in from `playbooks.tier`.
   *  Null when the trade has no playbook assigned. */
  playbook_tier: PlaybookTier | null
  confidence: number | null
  mistakes: string[]
  /** Legacy: $ amount the trader was willing to lose on the trade. Kept for
   *  back-compat. R-multiple falls back to net_pnl / planned_risk when
   *  planned_stop_loss_price is unset. */
  planned_risk: number | null
  /** Pre-trade stop loss PRICE (e.g. 10.20). When set, risk_per_share =
   *  |avg_entry - planned_stop_loss_price|, total_risk = risk_per_share ×
   *  shares, and R-multiple = net_pnl / total_risk. */
  planned_stop_loss_price: number | null
  /** Derived: |avg_entry - planned_stop_loss_price|. Null when stop price
   *  is unset. */
  risk_per_share: number | null
  /** Derived: risk_per_share × shares. Falls back to planned_risk when
   *  stop price is unset. */
  total_risk: number | null
  /** Computed: net_pnl / total_risk. Falls back to net_pnl / planned_risk
   *  when stop price is unset. Null when neither path yields a value. */
  r_multiple: number | null
  /** v0.2.5 Trader DNA — at-entry daily % change vs the prior session's close:
   *  (entryPrice − prevClose) / prevClose × 100. Backfilled per trade from daily
   *  bars in a later beat; NULL = not computed yet (treat as "unknown", never
   *  fabricate). Rides the row like mae/mfe — a trades column, no join. */
  daily_change_pct: number | null
  /** v0.2.5 Trader DNA — full-day relative volume: the trade day's volume ÷ the
   *  symbol's ~30-day average, from cached market_data (the Reports definition).
   *  Zero-API cache re-derive; NULL = no cache / uncomputable, never fabricated.
   *  Rides the row like daily_change_pct. */
  rvol: number | null
  /** Tradable free float — CURRENT snapshot (not point-in-time-of-trade;
   *  point-in-time stays a v0.3.0 tentpole). v0.2.2 Commit B onward this
   *  holds REAL FMP float, not the legacy shares-outstanding mislabel.
   *  Auto-populated from market_data.float on import; user-editable in
   *  the detail modal's Float row. Null when FMP returned no data
   *  ("Unavailable" UI cue) or before Commit B's enrichment has run. */
  float_shares: number | null
  /** Issued share count (current). v0.2.2 Commit B — populated from FMP
   *  outstandingShares; also preserved from the schema-21 legacy data
   *  move for pre-Commit-B trades. Display-only in the modal "Shares
   *  Out" row; not a momentum-quality choice so no user override path. */
  shares_outstanding: number | null
  /** Catalyst type for the trade (News / Earnings / Halt Resume / etc.).
   *  Free-form text so the dropdown can grow without a schema change. */
  catalyst_type: string | null
  /** Integer days since the catalyst event. 0 = same-day, 1 = day-2
   *  continuation, etc. Null when not applicable. */
  days_since_catalyst: number | null
  /** ISO 3166-1 alpha-2 of the company's country of OPERATIONS. Auto-
   *  detected from Polygon's ticker reference; nullable when no data or
   *  the user explicitly cleared it. */
  country: string | null
  /** Human-readable name — 'Unknown' when country is null. Cached at
   *  write time so list/breakdown queries don't have to join a lookup. */
  country_name: string
  /** Bucket key (USA, China, Europe, ...). 'Unknown' when country is
   *  null. One country → exactly one region; see src/core/country. */
  region: string
  /** Where the value came from. Canonical union is CountrySource in
   *  src/core/country/source.ts; kept as an inline literal here because
   *  `shared` is the lowest layer and must not import from `src`. Keep in
   *  sync with that type.
   *  'fmp'      = real domicile from FMP /stable/profile (v0.2.3 primary) — confident.
   *  'polygon'  = real address.country / text hint from Polygon — confident.
   *  'inferred' = guessed from listing locale/exchange (US-listing ≠ domicile)
   *               — shown with a "verify" cue and re-resolvable.
   *  'manual'   = user override; never overwritten by automatic backfill.
   *  'unknown'  = we tried and couldn't resolve. */
  country_source: 'fmp' | 'polygon' | 'inferred' | 'manual' | 'unknown'
  /** Number of screenshot attachments — drives the badge on the expand-row
   *  Screenshots button so the user knows the trade has visuals without
   *  opening the modal. */
  attachment_count: number
  /** Beat 4c — count of SECONDARY confluence tags (trade_playbooks rows) on this
   *  trade, for the Analytics confluence count-buckets. Secondaries ONLY; the
   *  primary setup lives on playbook_id. Mirrors attachment_count (correlated
   *  COUNT subquery, COALESCE 0). */
  secondary_tag_count: number
  /** v0.2.3 soft-delete. NULL = live; ISO-8601 UTC timestamp = in Trash.
   *  List reads exclude deleted rows; getTrade returns them so the modal /
   *  Trash UI can render the deleted state. */
  deleted_at: string | null
}

export interface UpdateTimeframeInput {
  trade_id: number
  timeframe: EntryTimeframe | null
}

export interface UpdateConfidenceInput {
  trade_id: number
  confidence: number | null  // 1..5 or null
}

export interface UpdateMistakesInput {
  trade_id: number
  mistakes: string[]
}

export interface UpdatePlannedRiskInput {
  trade_id: number
  planned_risk: number | null
}

export interface UpdatePlannedStopLossInput {
  trade_id: number
  /** Stop price in dollars; null clears. */
  planned_stop_loss_price: number | null
}

export interface UpdateFloatInput {
  trade_id: number
  float_shares: number | null
}

export interface UpdateCatalystInput {
  trade_id: number
  catalyst_type: string | null
  days_since_catalyst: number | null
}

export interface UpdateCountryInput {
  trade_id: number
  /** ISO alpha-2 (any case) or null to clear. */
  country: string | null
  /** Defaults to 'manual' when omitted. The IPC handler only ever stores
   *  'manual' from this entry point — 'polygon'/'unknown' come from the
   *  backfill flow. */
  source?: 'polygon' | 'inferred' | 'manual' | 'unknown'
}

export interface UpdateCountryForSymbolInput {
  /** Apply to EVERY trade of this symbol (bulk manual override). */
  symbol: string
  /** ISO alpha-2 (any case) or null to clear to Unknown. Always stored manual. */
  country: string | null
}

/** Canonical catalyst options for the trade detail modal's dropdown.
 *  Stored as raw text; the dropdown picks from this list but custom
 *  values are tolerated by the DB column. */
export const CATALYST_TYPES = [
  'News',
  'Earnings',
  'Reverse Split',
  'Continuation',
  'Halt Resume',
  'FDA/Clinical',
  'Offering',
  'Other',
] as const
export type CatalystType = (typeof CATALYST_TYPES)[number]

export interface UpdateNoteInput {
  trade_id: number
  text: string
}

// v0.2.3 P2b — soft-delete lifecycle IPC payloads. Single-trade ops carry one
// trade_id (mirrors the Update*Input family); bulk ops carry an id array.
export type SingleTradeIdInput = { trade_id: number }
export type BulkLifecycleInput = { trade_ids: number[] }

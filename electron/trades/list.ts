import { openDatabase } from '../db/database'
import { computeRiskBreakdown } from '../lib/r-multiple'
import { orderByIds } from '@/lib/orderByIds'
import { scopeFilter } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import type { EntryTimeframe, TradeListRow, TradeNote } from '@shared/trades-types'
import type { MistakeAxis } from '@shared/mistakes-types'
import type { RoundTripExecution } from '@shared/import-types'
import { PLAYBOOK_TIERS, type PlaybookTier } from '@shared/playbook-types'

function parsePlaybookTier(raw: string | null | undefined): PlaybookTier | null {
  if (!raw) return null
  return (PLAYBOOK_TIERS as readonly string[]).includes(raw) ? (raw as PlaybookTier) : null
}

interface TradeRowDb {
  id: number
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  is_open: number
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  gross_pnl: number
  total_fees: number
  commission: number | null
  net_pnl: number
  source_format: string | null
  executions_json: string
  entry_timeframe: string | null
  entry_ema9_distance_pct: number | null
  mae: number | null
  mfe: number | null
  daily_change_pct: number | null
  rvol: number | null
  playbook_id: number | null
  playbook_name: string | null
  playbook_tier: string | null
  confidence: number | null
  planned_risk: number | null
  planned_stop_loss_price: number | null
  float_shares: number | null
  shares_outstanding: number | null
  catalyst_type: string | null
  days_since_catalyst: number | null
  country: string | null
  country_name: string | null
  region: string | null
  country_source: string | null
  note_text: string | null
  attachment_count: number
  secondary_tag_count: number
  mistake_link_count: number
  // Beat 2c-display-α — the batched junction read: a json_group_array(json_object(
  // 'name', md.name, 'axis', md.axis)) string from trade_mistake → mistake_def,
  // already ORDER BY axis, sort_position. NULL when the trade has no junction rows.
  mistake_tags_json: string | null
  deleted_at: string | null
  account_id: string
}

function rowRisk(row: TradeRowDb) {
  return computeRiskBreakdown(row.net_pnl, {
    side: row.side,
    avg_buy_price: row.avg_buy_price,
    avg_sell_price: row.avg_sell_price,
    shares_bought: row.shares_bought,
    shares_sold: row.shares_sold,
    planned_risk: row.planned_risk,
    planned_stop_loss_price: row.planned_stop_loss_price,
  })
}

// Clamp a stored axis string to the two-value union — defensive; the mistake_def
// CHECK constraint keeps it to these (mirrors electron/mistakes/repo.ts:toAxis).
function toAxis(raw: unknown): MistakeAxis {
  return raw === 'psychological' ? 'psychological' : 'technical'
}

// Beat 2c-display-α — parse the batched junction read: a json_group_array(
// json_object('name', md.name, 'axis', md.axis)) string, already ORDER BY axis,
// sort_position from SQL. Returns the ordered {name, axis} tags; the legacy
// `mistakes` string[] is just these .name values (same order). Blank names are
// dropped (mirrors the old parseMistakes filter(Boolean)) — junction names are
// never blank, so this is belt-and-suspenders.
function parseMistakeTags(
  raw: string | null | undefined,
): { name: string; axis: MistakeAxis }[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .map((e) => ({
        name: String((e as { name?: unknown }).name ?? ''),
        axis: toAxis((e as { axis?: unknown }).axis),
      }))
      .filter((t) => t.name)
  } catch {
    return []
  }
}

function parseTimeframe(raw: string | null | undefined): EntryTimeframe | null {
  if (raw === '10s' || raw === '1m' || raw === '5m') return raw
  return null
}

function parseExecutions(raw: string | null | undefined): RoundTripExecution[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as RoundTripExecution[]
  } catch {
    return []
  }
}

function buildNote(row: TradeRowDb): TradeNote | null {
  const text = row.note_text?.trim() ?? ''
  if (!text) return null
  return { text }
}

/**
 * Lean projection for trade_technicals bulk backfill — exactly the
 * fields computeTradeTechnicals needs, nothing else. Avoiding the
 * LEFT JOIN-heavy getTrade(id) shape so N=5000 backfill stays cheap.
 *
 * Not exported through @shared/trades-types: the backfill runner in
 * electron/technicals/backfill.ts is the sole consumer, so the type
 * stays internal to the electron layer.
 */
export interface TradeForTechnicalsRow {
  id: number
  symbol: string
  date: string
  side: 'long' | 'short'
  executions_json: string | null
}

/**
 * Fetch the lean per-trade rows for the given ids, preserving input
 * order and skipping missing ids. Trash (deleted_at IS NOT NULL) is
 * excluded — matches lazy-guard.ts:getTradesForSymbolDate precedent.
 * Re-ordering and missing-id skip handled by the pure orderByIds
 * helper (src/lib/orderByIds.ts) — see that module for the contract.
 */
export function getTradesByIdsForTechnicals(
  ids: readonly number[],
): TradeForTechnicalsRow[] {
  if (ids.length === 0) return []
  const db = openDatabase()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT id, symbol, date, side, executions_json
       FROM trades
       WHERE id IN (${placeholders})
         AND deleted_at IS NULL`,
    )
    .all(...ids) as TradeForTechnicalsRow[]
  return orderByIds(rows, ids, (r) => r.id)
}

export interface ListTradesOptions {
  date?: string
  /** Inclusive Eastern-trading-day range (YYYY-MM-DD). Used by the Weekly
   *  Review modal. `date` takes precedence if both are given. */
  from?: string
  to?: string
  /** v0.2.3 soft-delete. Omitted/false → only live trades (deleted_at IS
   *  NULL). true → only soft-deleted trades (deleted_at IS NOT NULL), backing
   *  the Settings → Trash card. */
  deleted?: boolean
  /** Multi-account (Calendar slice) — OPTIONAL account scope. The distinction
   *  is load-bearing: ABSENT means legacy UNSCOPED (every existing caller —
   *  Trades page, Journal, insights — stays byte-identical), NOT the 'all'
   *  wall. Callers opt in per surface as their slice lands; the Calendar
   *  compare strip is the first. */
  accountScope?: AccountScope
}

export function listTrades(opts: ListTradesOptions = {}): TradeListRow[] {
  const db = openDatabase()
  // The soft-delete predicate is always present: the default list shows only
  // live trades; { deleted: true } shows only the Trash. Other filters AND on.
  const conds: string[] = [
    opts.deleted ? 't.deleted_at IS NOT NULL' : 't.deleted_at IS NULL',
  ]
  const params: string[] = []
  if (opts.date) {
    conds.push('t.date = ?')
    params.push(opts.date)
  } else if (opts.from && opts.to) {
    // Inclusive range on the Eastern trading-day column (no clock component,
    // so the full day at each end is covered; lexicographic = chronological).
    conds.push('t.date >= ?')
    conds.push('t.date <= ?')
    params.push(opts.from, opts.to)
  }
  // Trades-page slice ALIGNMENT: absent resolves through the seam as 'all'
  // (the non-sim wall) — consistent with the dashboard/calendar handlers.
  // Vacuously identical today (sim imports blocked ⇒ no sim rows); the wall
  // becomes load-bearing the day they unlock. Bare account_id is unambiguous
  // here — trades is the only joined table carrying the column.
  const sf = scopeFilter(opts.accountScope ?? 'all')
  conds.push(sf.clause)
  params.push(...sf.params)
  const where = `WHERE ${conds.join(' AND ')}`
  const rows = db
    .prepare(`
      SELECT
        t.id, t.date, t.symbol, t.side, t.open_time, t.close_time, t.is_open,
        t.shares_bought, t.avg_buy_price, t.shares_sold, t.avg_sell_price,
        t.gross_pnl, t.total_fees, t.commission, t.net_pnl, t.executions_json,
        t.source_format,
        t.entry_timeframe, t.entry_ema9_distance_pct, t.mae, t.mfe, t.daily_change_pct, t.rvol,
        t.playbook_id, p.name AS playbook_name,
        CASE WHEN p.is_system = 1 THEN NULL ELSE p.tier END AS playbook_tier,
        t.confidence, t.planned_risk, t.planned_stop_loss_price,
        t.float_shares, t.shares_outstanding,
        t.catalyst_type, t.days_since_catalyst,
        t.country, t.country_name, t.region, t.country_source,
        t.deleted_at, t.account_id,
        n.note_text,
        COALESCE(att.n, 0) AS attachment_count,
        COALESCE(tp.n, 0) AS secondary_tag_count,
        COALESCE(tm.n, 0) AS mistake_link_count,
        mt.tags AS mistake_tags_json
      FROM trades t
      LEFT JOIN trade_notes n ON n.trade_id = t.id
      LEFT JOIN playbooks p ON p.id = t.playbook_id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_attachments GROUP BY trade_id
      ) att ON att.trade_id = t.id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_playbooks GROUP BY trade_id
      ) tp ON tp.trade_id = t.id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_mistake GROUP BY trade_id
      ) tm ON tm.trade_id = t.id
      LEFT JOIN (
        SELECT jm.trade_id AS trade_id,
               json_group_array(
                 json_object('name', md.name, 'axis', md.axis)
                 ORDER BY md.axis, md.sort_position
               ) AS tags
        FROM trade_mistake jm
        JOIN mistake_def md ON md.id = jm.mistake_def_id
        GROUP BY jm.trade_id
      ) mt ON mt.trade_id = t.id
      ${where}
      ORDER BY t.open_time DESC
    `)
    .all(...params) as TradeRowDb[]

  return rows.map((r) => {
    const risk = rowRisk(r)
    const mistakeTags = parseMistakeTags(r.mistake_tags_json)
    return {
      id: r.id,
      date: r.date,
      symbol: r.symbol,
      side: r.side,
      open_time: r.open_time,
      close_time: r.close_time,
      is_open: !!r.is_open,
      shares_bought: r.shares_bought,
      avg_buy_price: r.avg_buy_price,
      shares_sold: r.shares_sold,
      avg_sell_price: r.avg_sell_price,
      gross_pnl: r.gross_pnl,
      total_fees: r.total_fees,
      commission: r.commission,
      net_pnl: r.net_pnl,
      source_format: r.source_format,
      executions: parseExecutions(r.executions_json),
      entry_timeframe: parseTimeframe(r.entry_timeframe),
      entry_ema9_distance_pct: r.entry_ema9_distance_pct,
      mae: r.mae,
      mfe: r.mfe,
      daily_change_pct: r.daily_change_pct,
      rvol: r.rvol,
      playbook_id: r.playbook_id,
      playbook_name: r.playbook_name,
      playbook_tier: parsePlaybookTier(r.playbook_tier),
      confidence: r.confidence,
      mistakes: mistakeTags.map((t) => t.name),
      mistakeTags,
      planned_risk: r.planned_risk,
      planned_stop_loss_price: r.planned_stop_loss_price,
      risk_per_share: risk.risk_per_share,
      total_risk: risk.total_risk,
      r_multiple: risk.r_multiple,
      float_shares: r.float_shares,
      shares_outstanding: r.shares_outstanding,
      catalyst_type: r.catalyst_type,
      days_since_catalyst: r.days_since_catalyst,
      country: r.country,
      country_name: r.country_name ?? 'Unknown',
      region: r.region ?? 'Unknown',
      country_source: (r.country_source as 'polygon' | 'inferred' | 'manual' | 'unknown' | null) ?? 'unknown',
      note: buildNote(r),
      attachment_count: r.attachment_count ?? 0,
      secondary_tag_count: r.secondary_tag_count ?? 0,
      mistake_link_count: r.mistake_link_count ?? 0,
      deleted_at: r.deleted_at,
      account_id: r.account_id,
    }
  })
}

// All trades whose Eastern trading day falls in [from, to] (inclusive).
// Backs the Weekly Review modal's week range.
export function listTradesInRange(from: string, to: string): TradeListRow[] {
  return listTrades({ from, to })
}

export function getTrade(id: number): TradeListRow | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT
        t.id, t.date, t.symbol, t.side, t.open_time, t.close_time, t.is_open,
        t.shares_bought, t.avg_buy_price, t.shares_sold, t.avg_sell_price,
        t.gross_pnl, t.total_fees, t.commission, t.net_pnl, t.executions_json,
        t.source_format,
        t.entry_timeframe, t.entry_ema9_distance_pct, t.mae, t.mfe, t.daily_change_pct, t.rvol,
        t.playbook_id, p.name AS playbook_name,
        CASE WHEN p.is_system = 1 THEN NULL ELSE p.tier END AS playbook_tier,
        t.confidence, t.planned_risk, t.planned_stop_loss_price,
        t.float_shares, t.shares_outstanding,
        t.catalyst_type, t.days_since_catalyst,
        t.country, t.country_name, t.region, t.country_source,
        t.deleted_at, t.account_id,
        n.note_text,
        COALESCE(att.n, 0) AS attachment_count,
        COALESCE(tp.n, 0) AS secondary_tag_count,
        COALESCE(tm.n, 0) AS mistake_link_count,
        mt.tags AS mistake_tags_json
      FROM trades t
      LEFT JOIN trade_notes n ON n.trade_id = t.id
      LEFT JOIN playbooks p ON p.id = t.playbook_id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_attachments GROUP BY trade_id
      ) att ON att.trade_id = t.id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_playbooks GROUP BY trade_id
      ) tp ON tp.trade_id = t.id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_mistake GROUP BY trade_id
      ) tm ON tm.trade_id = t.id
      LEFT JOIN (
        SELECT jm.trade_id AS trade_id,
               json_group_array(
                 json_object('name', md.name, 'axis', md.axis)
                 ORDER BY md.axis, md.sort_position
               ) AS tags
        FROM trade_mistake jm
        JOIN mistake_def md ON md.id = jm.mistake_def_id
        GROUP BY jm.trade_id
      ) mt ON mt.trade_id = t.id
      WHERE t.id = ?
    `)
    .get(id) as TradeRowDb | undefined
  if (!row) return null
  const risk = rowRisk(row)
  const mistakeTags = parseMistakeTags(row.mistake_tags_json)
  return {
    id: row.id,
    date: row.date,
    symbol: row.symbol,
    side: row.side,
    open_time: row.open_time,
    close_time: row.close_time,
    is_open: !!row.is_open,
    shares_bought: row.shares_bought,
    avg_buy_price: row.avg_buy_price,
    shares_sold: row.shares_sold,
    avg_sell_price: row.avg_sell_price,
    gross_pnl: row.gross_pnl,
    total_fees: row.total_fees,
    commission: row.commission,
    net_pnl: row.net_pnl,
    source_format: row.source_format,
    executions: parseExecutions(row.executions_json),
    entry_timeframe: parseTimeframe(row.entry_timeframe),
    entry_ema9_distance_pct: row.entry_ema9_distance_pct,
    mae: row.mae,
    mfe: row.mfe,
    daily_change_pct: row.daily_change_pct,
    rvol: row.rvol,
    playbook_id: row.playbook_id,
    playbook_name: row.playbook_name,
    playbook_tier: parsePlaybookTier(row.playbook_tier),
    confidence: row.confidence,
    mistakes: mistakeTags.map((t) => t.name),
    mistakeTags,
    planned_risk: row.planned_risk,
    planned_stop_loss_price: row.planned_stop_loss_price,
    risk_per_share: risk.risk_per_share,
    total_risk: risk.total_risk,
    r_multiple: risk.r_multiple,
    float_shares: row.float_shares,
    shares_outstanding: row.shares_outstanding,
    catalyst_type: row.catalyst_type,
    days_since_catalyst: row.days_since_catalyst,
    country: row.country,
    country_name: row.country_name ?? 'Unknown',
    region: row.region ?? 'Unknown',
    country_source: (row.country_source as 'polygon' | 'inferred' | 'manual' | 'unknown' | null) ?? 'unknown',
    note: buildNote(row),
    attachment_count: row.attachment_count ?? 0,
    secondary_tag_count: row.secondary_tag_count ?? 0,
    mistake_link_count: row.mistake_link_count ?? 0,
    deleted_at: row.deleted_at,
    account_id: row.account_id,
  }
}

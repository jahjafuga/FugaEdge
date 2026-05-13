import { openDatabase } from '../db/database'
import { computeRiskBreakdown } from '../lib/r-multiple'
import type { EntryTimeframe, TradeListRow, TradeNote } from '@shared/trades-types'
import type { RoundTripExecution } from '@shared/import-types'

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
  net_pnl: number
  executions_json: string
  entry_timeframe: string | null
  entry_ema9_distance_pct: number | null
  playbook_id: number | null
  playbook_name: string | null
  confidence: number | null
  mistakes_json: string | null
  planned_risk: number | null
  planned_stop_loss_price: number | null
  float_shares: number | null
  catalyst_type: string | null
  days_since_catalyst: number | null
  note_text: string | null
  attachment_count: number
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

function parseMistakes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map((s) => String(s)).filter(Boolean)
  } catch {
    // ignore — return empty
  }
  return []
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

export interface ListTradesOptions {
  date?: string
}

export function listTrades(opts: ListTradesOptions = {}): TradeListRow[] {
  const db = openDatabase()
  const where = opts.date ? 'WHERE t.date = ?' : ''
  const params = opts.date ? [opts.date] : []
  const rows = db
    .prepare(`
      SELECT
        t.id, t.date, t.symbol, t.side, t.open_time, t.close_time, t.is_open,
        t.shares_bought, t.avg_buy_price, t.shares_sold, t.avg_sell_price,
        t.gross_pnl, t.total_fees, t.net_pnl, t.executions_json,
        t.entry_timeframe, t.entry_ema9_distance_pct,
        t.playbook_id, p.name AS playbook_name,
        t.confidence, t.mistakes_json, t.planned_risk, t.planned_stop_loss_price,
        t.float_shares,
        t.catalyst_type, t.days_since_catalyst,
        n.note_text,
        COALESCE(att.n, 0) AS attachment_count
      FROM trades t
      LEFT JOIN trade_notes n ON n.trade_id = t.id
      LEFT JOIN playbooks p ON p.id = t.playbook_id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_attachments GROUP BY trade_id
      ) att ON att.trade_id = t.id
      ${where}
      ORDER BY t.open_time DESC
    `)
    .all(...params) as TradeRowDb[]

  return rows.map((r) => {
    const risk = rowRisk(r)
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
      net_pnl: r.net_pnl,
      executions: parseExecutions(r.executions_json),
      entry_timeframe: parseTimeframe(r.entry_timeframe),
      entry_ema9_distance_pct: r.entry_ema9_distance_pct,
      playbook_id: r.playbook_id,
      playbook_name: r.playbook_name,
      confidence: r.confidence,
      mistakes: parseMistakes(r.mistakes_json),
      planned_risk: r.planned_risk,
      planned_stop_loss_price: r.planned_stop_loss_price,
      risk_per_share: risk.risk_per_share,
      total_risk: risk.total_risk,
      r_multiple: risk.r_multiple,
      float_shares: r.float_shares,
      catalyst_type: r.catalyst_type,
      days_since_catalyst: r.days_since_catalyst,
      note: buildNote(r),
      attachment_count: r.attachment_count ?? 0,
    }
  })
}

export function getTrade(id: number): TradeListRow | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT
        t.id, t.date, t.symbol, t.side, t.open_time, t.close_time, t.is_open,
        t.shares_bought, t.avg_buy_price, t.shares_sold, t.avg_sell_price,
        t.gross_pnl, t.total_fees, t.net_pnl, t.executions_json,
        t.entry_timeframe, t.entry_ema9_distance_pct,
        t.playbook_id, p.name AS playbook_name,
        t.confidence, t.mistakes_json, t.planned_risk, t.planned_stop_loss_price,
        t.float_shares,
        t.catalyst_type, t.days_since_catalyst,
        n.note_text,
        COALESCE(att.n, 0) AS attachment_count
      FROM trades t
      LEFT JOIN trade_notes n ON n.trade_id = t.id
      LEFT JOIN playbooks p ON p.id = t.playbook_id
      LEFT JOIN (
        SELECT trade_id, COUNT(*) AS n FROM trade_attachments GROUP BY trade_id
      ) att ON att.trade_id = t.id
      WHERE t.id = ?
    `)
    .get(id) as TradeRowDb | undefined
  if (!row) return null
  const risk = rowRisk(row)
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
    net_pnl: row.net_pnl,
    executions: parseExecutions(row.executions_json),
    entry_timeframe: parseTimeframe(row.entry_timeframe),
    entry_ema9_distance_pct: row.entry_ema9_distance_pct,
    playbook_id: row.playbook_id,
    playbook_name: row.playbook_name,
    confidence: row.confidence,
    mistakes: parseMistakes(row.mistakes_json),
    planned_risk: row.planned_risk,
    planned_stop_loss_price: row.planned_stop_loss_price,
    risk_per_share: risk.risk_per_share,
    total_risk: risk.total_risk,
    r_multiple: risk.r_multiple,
    float_shares: row.float_shares,
    catalyst_type: row.catalyst_type,
    days_since_catalyst: row.days_since_catalyst,
    note: buildNote(row),
    attachment_count: row.attachment_count ?? 0,
  }
}

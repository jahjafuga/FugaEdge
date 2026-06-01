import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import Papa from 'papaparse'
import { openDatabase } from '../db/database'
import type { ExportResult } from '@shared/settings-types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TradeForExport {
  id: number
  date: string
  symbol: string
  side: string
  open_time: string
  close_time: string | null
  is_open: number
  shares_bought: number
  avg_buy_price: number
  shares_sold: number
  avg_sell_price: number
  gross_pnl: number
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  total_fees: number
  net_pnl: number
  executions_json: string
}

export async function exportTradesCsv(sender: Electron.WebContents): Promise<ExportResult> {
  const win = BrowserWindow.fromWebContents(sender) ?? undefined
  const pick = await dialog.showSaveDialog(win!, {
    title: 'Export trades to CSV',
    defaultPath: `fugaedge-trades-${today()}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (pick.canceled || !pick.filePath) return { canceled: true }

  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT id, date, symbol, side, open_time, close_time, is_open,
             shares_bought, avg_buy_price, shares_sold, avg_sell_price,
             gross_pnl, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat,
             total_fees, net_pnl, executions_json
      FROM trades
      WHERE deleted_at IS NULL
      ORDER BY open_time ASC
    `)
    .all() as TradeForExport[]

  const out = rows.map((r) => ({
    id: r.id,
    date: r.date,
    symbol: r.symbol,
    side: r.side,
    open_time: r.open_time,
    close_time: r.close_time ?? '',
    is_open: r.is_open ? 1 : 0,
    shares_bought: r.shares_bought,
    avg_buy_price: r.avg_buy_price,
    shares_sold: r.shares_sold,
    avg_sell_price: r.avg_sell_price,
    gross_pnl: r.gross_pnl,
    fee_ecn: r.fee_ecn,
    fee_sec: r.fee_sec,
    fee_finra: r.fee_finra,
    fee_htb: r.fee_htb,
    fee_cat: r.fee_cat,
    total_fees: r.total_fees,
    net_pnl: r.net_pnl,
    fill_count: safeFillCount(r.executions_json),
  }))

  const csv = Papa.unparse(out, { newline: '\n' })
  await writeFile(pick.filePath, csv, 'utf8')

  return { canceled: false, path: pick.filePath, rowCount: rows.length }
}

function safeFillCount(json: string | null | undefined): number {
  if (!json) return 0
  try {
    const arr = JSON.parse(json)
    if (Array.isArray(arr)) return arr.length
  } catch {
    // ignore
  }
  return 0
}

interface JournalExportRow {
  date: string
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string[]
  rule_violations: string[]
}

interface JournalDbRow {
  date: string
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string
  rule_violations: string
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.map(String)
    } catch {
      // ignore
    }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function exportJournalJson(sender: Electron.WebContents): Promise<ExportResult> {
  const win = BrowserWindow.fromWebContents(sender) ?? undefined
  const pick = await dialog.showSaveDialog(win!, {
    title: 'Export journal to JSON',
    defaultPath: `fugaedge-journal-${today()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (pick.canceled || !pick.filePath) return { canceled: true }

  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT date, premarket_notes, postsession_notes, emotion_rating,
             rules_followed, rule_violations
      FROM journal ORDER BY date ASC
    `)
    .all() as JournalDbRow[]

  const out: JournalExportRow[] = rows.map((r) => ({
    date: r.date,
    premarket_notes: r.premarket_notes ?? '',
    postsession_notes: r.postsession_notes ?? '',
    emotion_rating: r.emotion_rating ?? null,
    rules_followed: parseStringArray(r.rules_followed),
    rule_violations: parseStringArray(r.rule_violations),
  }))

  await writeFile(pick.filePath, JSON.stringify(out, null, 2), 'utf8')
  return { canceled: false, path: pick.filePath, rowCount: rows.length }
}

export async function exportDatabase(sender: Electron.WebContents): Promise<ExportResult> {
  const win = BrowserWindow.fromWebContents(sender) ?? undefined
  const pick = await dialog.showSaveDialog(win!, {
    title: 'Back up database',
    defaultPath: `fugaedge-backup-${today()}.db`,
    filters: [{ name: 'SQLite', extensions: ['db'] }],
  })
  if (pick.canceled || !pick.filePath) return { canceled: true }

  // better-sqlite3 ships a safe online backup that respects WAL — far better
  // than fs.copyFile, which can capture a torn snapshot if a write lands
  // mid-copy.
  const db = openDatabase()
  await db.backup(pick.filePath)
  return { canceled: false, path: pick.filePath }
}

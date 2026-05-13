import { openDatabase } from '../db/database'
import type { AttachmentRecord } from '@shared/attachment-types'

interface RowDb {
  id: number
  trade_id: number
  filename: string
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
}

function rowTo(r: RowDb): AttachmentRecord {
  return {
    id: r.id,
    trade_id: r.trade_id,
    filename: r.filename,
    original_name: r.original_name,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    created_at: r.created_at,
  }
}

export function listForTrade(tradeId: number): AttachmentRecord[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT id, trade_id, filename, original_name, mime_type, size_bytes, created_at
      FROM trade_attachments
      WHERE trade_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .all(tradeId) as RowDb[]
  return rows.map(rowTo)
}

export function getById(id: number): AttachmentRecord | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT id, trade_id, filename, original_name, mime_type, size_bytes, created_at
      FROM trade_attachments WHERE id = ?
    `)
    .get(id) as RowDb | undefined
  return row ? rowTo(row) : null
}

export function insert(input: Omit<AttachmentRecord, 'id' | 'created_at'>): AttachmentRecord {
  const db = openDatabase()
  const info = db
    .prepare(`
      INSERT INTO trade_attachments (trade_id, filename, original_name, mime_type, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(
      input.trade_id,
      input.filename,
      input.original_name,
      input.mime_type,
      input.size_bytes,
    )
  const created = getById(Number(info.lastInsertRowid))
  if (!created) throw new Error('Attachment row disappeared after insert')
  return created
}

export function remove(id: number): AttachmentRecord | null {
  const db = openDatabase()
  const existing = getById(id)
  if (!existing) return null
  db.prepare('DELETE FROM trade_attachments WHERE id = ?').run(id)
  return existing
}

import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  AttachmentRecord,
} from '@shared/attachment-types'
import { getTradeAttachmentDir } from './dir'
import { getById, insert, listForTrade, remove } from './repo'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

function extForMime(mime: string): string | null {
  switch (mime) {
    case 'image/png': return '.png'
    case 'image/jpeg': return '.jpg'
    case 'image/gif': return '.gif'
    case 'image/webp': return '.webp'
    default: return null
  }
}

export async function addAttachments(
  input: AddAttachmentsInput,
): Promise<AddAttachmentsResult> {
  const tradeId = Number(input.trade_id)
  if (!Number.isFinite(tradeId)) {
    throw new Error('Invalid trade_id')
  }

  const dir = getTradeAttachmentDir(tradeId)
  await mkdir(dir, { recursive: true })

  const added: AttachmentRecord[] = []
  const rejected: { name: string; reason: string }[] = []

  for (const file of input.files ?? []) {
    const name = file.original_name || 'attachment'
    const mime = (file.mime_type || '').toLowerCase()
    const buf = file.data

    if (!ALLOWED_MIMES.has(mime)) {
      rejected.push({ name, reason: `Unsupported type: ${mime || 'unknown'}` })
      continue
    }
    if (!buf || buf.byteLength === 0) {
      rejected.push({ name, reason: 'Empty file' })
      continue
    }
    if (buf.byteLength > MAX_BYTES) {
      rejected.push({
        name,
        reason: `Too large (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB; cap is 10 MB)`,
      })
      continue
    }

    const ext = extForMime(mime) ?? '.bin'
    const filename = `${randomUUID()}${ext}`
    const filePath = join(dir, filename)

    try {
      await writeFile(filePath, Buffer.from(buf))
    } catch (e) {
      rejected.push({
        name,
        reason: e instanceof Error ? e.message : 'Disk write failed',
      })
      continue
    }

    try {
      const row = insert({
        trade_id: tradeId,
        filename,
        original_name: name,
        mime_type: mime,
        size_bytes: buf.byteLength,
      })
      added.push(row)
    } catch (e) {
      // Roll back the file write if the DB insert failed — otherwise we get
      // an orphan file with no row to clean it up.
      try {
        await unlink(filePath)
      } catch {
        // ignore
      }
      rejected.push({
        name,
        reason: e instanceof Error ? e.message : 'DB insert failed',
      })
    }
  }

  return { added, rejected }
}

export async function deleteAttachment(id: number): Promise<AttachmentRecord | null> {
  const row = getById(id)
  if (!row) return null
  // Remove the file first; if the DB row deletion later fails we'd rather
  // have an orphan row than a row pointing to a missing file.
  const filePath = join(getTradeAttachmentDir(row.trade_id), row.filename)
  try {
    await unlink(filePath)
  } catch (e) {
    // Already missing? Keep going so the row gets cleaned up.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e
    }
  }
  return remove(id)
}

export function listAttachments(tradeId: number): AttachmentRecord[] {
  return listForTrade(tradeId)
}

import { app } from 'electron'
import { join } from 'node:path'

// Single source of truth for the attachments root. Co-locating with the
// sqlite file keeps a single "backup this folder" answer for the user.
export function getAttachmentsDir(): string {
  return join(app.getPath('userData'), 'attachments')
}

export function getTradeAttachmentDir(tradeId: number): string {
  return join(getAttachmentsDir(), String(tradeId))
}

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AddAttachmentsInput } from '@shared/attachment-types'
import {
  addAttachments,
  deleteAttachment,
  listAttachments,
} from './service'

export function registerAttachmentsIpc(): void {
  ipcMain.handle(IPC.ATTACHMENTS_LIST, (_e, tradeId: number) =>
    listAttachments(tradeId),
  )
  ipcMain.handle(IPC.ATTACHMENTS_ADD, async (_e, input: AddAttachmentsInput) => {
    // IPC delivers Uint8Array faithfully for file payloads — no need to
    // round-trip through base64.
    return addAttachments(input)
  })
  ipcMain.handle(IPC.ATTACHMENTS_DELETE, (_e, id: number) => deleteAttachment(id))
}

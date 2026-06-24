import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CreateMistakeDefInput,
  MistakeDefIdInput,
  MistakeTagInput,
  RenameMistakeDefInput,
  ReorderMistakeDefsInput,
} from '@shared/mistakes-types'
import { bumpDataVersion } from '../lib/cache'
import { getTrade } from '../trades/list'
import {
  addMistakeTag,
  archiveMistakeDef,
  createMistakeDef,
  deleteMistakeDef,
  getMistakeTagsForTrade,
  listMistakeDefs,
  removeMistakeTag,
  renameMistakeDef,
  reorderMistakeDefs,
  unarchiveMistakeDef,
} from './repo'

// Beat 2a — the mistakes API: read the mistake_def vocabulary, and read/add/remove
// a trade's mistake tags (the trade_mistake junction). Mirrors registerPlaybookIpc's
// tag handlers: GETs are PURE reads (no version bump); ADD/REMOVE write -> bump ->
// return the refreshed trade. NOTHING in the renderer calls these yet (Settings 2b +
// the two-axis pickers 2c will). Future: an XP-reconcile hook like the playbook add
// (if mistakes ever feed XP) — out of scope for 2a.
export function registerMistakesIpc(): void {
  ipcMain.handle(IPC.MISTAKE_DEFS_GET, (_e, includeArchived?: boolean) =>
    listMistakeDefs({ includeArchived }),
  )
  ipcMain.handle(IPC.TRADE_MISTAKE_TAGS_GET, (_e, tradeId: number) =>
    getMistakeTagsForTrade(tradeId),
  )
  ipcMain.handle(IPC.TRADE_MISTAKE_TAG_ADD, (_e, input: MistakeTagInput) => {
    addMistakeTag(input.trade_id, input.mistake_def_id)
    bumpDataVersion()
    return getTrade(input.trade_id)
  })
  ipcMain.handle(IPC.TRADE_MISTAKE_TAG_REMOVE, (_e, input: MistakeTagInput) => {
    removeMistakeTag(input.trade_id, input.mistake_def_id)
    bumpDataVersion()
    return getTrade(input.trade_id)
  })

  // Beat 2b — mistake_def vocabulary writes. Each write -> bumpDataVersion() ->
  // return the repo result (the updated def, the reordered list, or the delete
  // guard's verdict). A repo throw (dup, coverage, collision) propagates as the
  // IPC error, same as the playbook handlers.
  ipcMain.handle(IPC.MISTAKE_DEF_CREATE, (_e, input: CreateMistakeDefInput) => {
    const def = createMistakeDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.MISTAKE_DEF_RENAME, (_e, input: RenameMistakeDefInput) => {
    const def = renameMistakeDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.MISTAKE_DEFS_REORDER, (_e, input: ReorderMistakeDefsInput) => {
    const defs = reorderMistakeDefs(input)
    bumpDataVersion()
    return defs
  })
  ipcMain.handle(IPC.MISTAKE_DEF_ARCHIVE, (_e, input: MistakeDefIdInput) => {
    const def = archiveMistakeDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.MISTAKE_DEF_UNARCHIVE, (_e, input: MistakeDefIdInput) => {
    const def = unarchiveMistakeDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.MISTAKE_DEF_DELETE, (_e, input: MistakeDefIdInput) => {
    const result = deleteMistakeDef(input)
    bumpDataVersion()
    return result
  })
}

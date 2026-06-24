import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { MistakeTagInput } from '@shared/mistakes-types'
import { bumpDataVersion } from '../lib/cache'
import { getTrade } from '../trades/list'
import {
  addMistakeTag,
  getMistakeTagsForTrade,
  listMistakeDefs,
  removeMistakeTag,
} from './repo'

// Beat 2a — the mistakes API: read the mistake_def vocabulary, and read/add/remove
// a trade's mistake tags (the trade_mistake junction). Mirrors registerPlaybookIpc's
// tag handlers: GETs are PURE reads (no version bump); ADD/REMOVE write -> bump ->
// return the refreshed trade. NOTHING in the renderer calls these yet (Settings 2b +
// the two-axis pickers 2c will). Future: an XP-reconcile hook like the playbook add
// (if mistakes ever feed XP) — out of scope for 2a.
export function registerMistakesIpc(): void {
  ipcMain.handle(IPC.MISTAKE_DEFS_GET, () => listMistakeDefs())
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
}

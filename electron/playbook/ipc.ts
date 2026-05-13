import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CreatePlaybookInput,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import { bumpDataVersion } from '../lib/cache'
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  setPlaybookOnTrade,
  updatePlaybook,
} from './repo'
import { getTrade } from '../trades/list'

export function registerPlaybookIpc(): void {
  ipcMain.handle(IPC.PLAYBOOKS_LIST, () => listPlaybooks())
  ipcMain.handle(IPC.PLAYBOOK_CREATE, (_e, input: CreatePlaybookInput) => {
    const r = createPlaybook(input)
    bumpDataVersion()
    return r
  })
  ipcMain.handle(IPC.PLAYBOOK_UPDATE, (_e, input: UpdatePlaybookInput) => {
    const r = updatePlaybook(input)
    bumpDataVersion()
    return r
  })
  ipcMain.handle(
    IPC.TRADE_PLAYBOOK_SAVE,
    (_e, input: SetPlaybookOnTradeInput) => {
      setPlaybookOnTrade(input.trade_id, input.playbook_id)
      bumpDataVersion()
      return getTrade(input.trade_id)
    },
  )
  ipcMain.handle(IPC.PLAYBOOK_DELETE, (_e, id: number) => {
    const r = deletePlaybook(id)
    bumpDataVersion()
    return r
  })
}

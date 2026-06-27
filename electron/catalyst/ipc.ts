import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CatalystDefIdInput,
  CreateCatalystDefInput,
  RenameCatalystDefInput,
  ReorderCatalystDefsInput,
} from '@shared/catalyst-types'
import { bumpDataVersion } from '../lib/cache'
import {
  archiveCatalystDef,
  createCatalystDef,
  deleteCatalystDef,
  listCatalystDefs,
  renameCatalystDef,
  reorderCatalystDefs,
  unarchiveCatalystDef,
} from './repo'

// Beat 2 — the catalyst vocabulary API: read the catalyst_def list + the CRUD
// writes. Mirrors registerMistakesIpc's vocabulary handlers: GET is a PURE read (no
// version bump); each write -> bumpDataVersion() -> return the repo result. The
// rename bump is doubly-correct here: renameCatalystDef mutates trades.catalyst_type,
// so the trade list genuinely changed. NOTHING in the renderer calls these yet (the
// settings editor + the modal swap land in later beats).
export function registerCatalystIpc(): void {
  ipcMain.handle(IPC.CATALYST_DEFS_GET, (_e, includeArchived?: boolean) =>
    listCatalystDefs({ includeArchived }),
  )
  ipcMain.handle(IPC.CATALYST_DEF_CREATE, (_e, input: CreateCatalystDefInput) => {
    const def = createCatalystDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.CATALYST_DEF_RENAME, (_e, input: RenameCatalystDefInput) => {
    const def = renameCatalystDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.CATALYST_DEFS_REORDER, (_e, input: ReorderCatalystDefsInput) => {
    const defs = reorderCatalystDefs(input)
    bumpDataVersion()
    return defs
  })
  ipcMain.handle(IPC.CATALYST_DEF_ARCHIVE, (_e, input: CatalystDefIdInput) => {
    const def = archiveCatalystDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.CATALYST_DEF_UNARCHIVE, (_e, input: CatalystDefIdInput) => {
    const def = unarchiveCatalystDef(input)
    bumpDataVersion()
    return def
  })
  ipcMain.handle(IPC.CATALYST_DEF_DELETE, (_e, input: CatalystDefIdInput) => {
    const result = deleteCatalystDef(input)
    bumpDataVersion()
    return result
  })
}

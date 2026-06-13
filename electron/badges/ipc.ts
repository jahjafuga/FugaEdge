// v0.2.5 Phase B Session 6 — badges IPC. Read-only: the badge wall reads the
// user's EARNED awards; what CAN be earned (the catalog) is the pure code
// module src/core/badges/catalog.ts, imported renderer-side directly. Thin per
// ARCHITECTURE.md — the handler just calls the repo. Minting is engine-side
// (challenge completion) + future threshold sweeps, not here.
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { BadgeAward } from '@shared/identity-types'
import { listBadgeAwards } from './repo'

export function registerBadgesIpc(): void {
  ipcMain.handle(IPC.BADGES_LIST, (): BadgeAward[] => listBadgeAwards())
}

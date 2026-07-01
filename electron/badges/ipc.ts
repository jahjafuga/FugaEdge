// v0.2.5 Phase B Session 6 — badges IPC. The wall reads the user's EARNED
// awards; what CAN be earned (the catalog) is the pure code module
// src/core/badges/catalog.ts, imported renderer-side directly. BADGES_LIST first
// runs the read-time threshold sweep (mintEarnedBadges — display-only,
// idempotent), then returns the awards, so opening the Profile lights up any
// newly-crossed threshold. Challenge badges still mint on goal completion
// (goals/engine.ts).
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { BadgeAward } from '@shared/identity-types'
import { mintEarnedBadges } from './mint'
import { listBadgeAwards } from './repo'

export function registerBadgesIpc(): void {
  ipcMain.handle(IPC.BADGES_LIST, (): BadgeAward[] => {
    mintEarnedBadges()
    return listBadgeAwards()
  })
}

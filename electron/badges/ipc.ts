// v0.2.5 Phase B Session 6 — badges IPC. The wall reads the user's EARNED
// awards; what CAN be earned (the catalog) is the pure code module
// src/core/badges/catalog.ts, imported renderer-side directly.
//
// BADGES_LIST is READ-ONLY by default (opts.mint falsy). Only the Profile page
// passes { mint: true } to run the threshold sweep, so the newly-minted grades
// (the on-earn celebration signal) are consumed once, by the page that owns the
// celebration — the toolbar's per-route fetch stays read-only and cannot swallow
// it. Challenge badges still mint on goal completion (goals/engine.ts).
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { BadgesListResult } from '@shared/identity-types'
import { mintEarnedBadges } from './mint'
import { listBadgeAwards } from './repo'

export function registerBadgesIpc(): void {
  ipcMain.handle(
    IPC.BADGES_LIST,
    (_e, opts?: { mint?: boolean }): BadgesListResult => {
      const newlyMinted = opts?.mint ? mintEarnedBadges() : []
      return { awards: listBadgeAwards(), newlyMinted }
    },
  )
}

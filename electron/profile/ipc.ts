// v0.2.5 Phase B Session 4 — USER-profile IPC (L20; spec §B identity row).
// NOT the FMP company-profile backfill (electron/import/backfill-profile.ts
// / PROFILE_BACKFILL*) — see the A3 note in shared/ipc-channels.ts. Thin per
// ARCHITECTURE.md: the repo owns all logic; reads are uncached and the page
// refetches on route mount (D24 — no push channel, no dataVersion coupling).

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { Profile, UpdateProfileInput } from '@shared/identity-types'
import { getOrCreateProfile, updateProfile } from './repo'

export function registerProfileIpc(): void {
  ipcMain.handle(IPC.PROFILE_GET, (): Profile => getOrCreateProfile())

  ipcMain.handle(
    IPC.PROFILE_UPDATE,
    (_e, input: UpdateProfileInput): Profile => updateProfile(input),
  )
}

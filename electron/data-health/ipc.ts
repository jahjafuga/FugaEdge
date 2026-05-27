import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  acknowledgeContentHashCollisions,
  getDataHealth,
} from './repo'

export function registerDataHealthIpc(): void {
  ipcMain.handle(IPC.DATA_HEALTH_GET, () => getDataHealth())
  ipcMain.handle(IPC.DATA_HEALTH_ACKNOWLEDGE_COLLISIONS, () =>
    acknowledgeContentHashCollisions(),
  )
}

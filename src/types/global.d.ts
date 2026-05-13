import type { FugaApi } from '../../electron/preload'

declare global {
  interface Window {
    api: FugaApi
  }
}

export {}

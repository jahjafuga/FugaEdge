import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'

// Thin accessor for the running app's version. Reads it from the
// main-process IPC (which calls Electron's app.getVersion() — that reads
// package.json at runtime, so the value automatically tracks every
// release bump).
//
// Falls back to "dev" when window.api isn't available — useful for a
// future web target where IPC doesn't exist, and as a defensive default
// during the brief window between mount and the IPC promise resolving.

// Module-level cache: the version doesn't change for the lifetime of the
// process, so we hydrate it once and serve every subsequent caller
// synchronously from memory.
let cached: string | null = null
let inflight: Promise<string> | null = null

function fetchVersion(): Promise<string> {
  if (typeof window === 'undefined' || !window.api) {
    return Promise.resolve('dev')
  }
  if (inflight) return inflight
  inflight = ipc
    .getVersion()
    .then((v) => {
      cached = v
      return v
    })
    .catch(() => 'dev')
  return inflight
}

export function useAppVersion(): string {
  const [version, setVersion] = useState<string>(cached ?? 'dev')

  useEffect(() => {
    if (cached) {
      setVersion(cached)
      return
    }
    let active = true
    fetchVersion().then((v) => {
      if (active) setVersion(v)
    })
    return () => {
      active = false
    }
  }, [])

  return version
}

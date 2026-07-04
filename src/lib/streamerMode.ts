// Beat 4 (the arc closer) — streamer mode: hide account-level dollars for
// screen-share sessions. The masking itself is PURE CSS keyed on the
// 'streamer' class on <html>; this store owns the state.
//
// Mirrors theme.ts exactly (the ruled shape): a localStorage-backed
// external store (listener Set + useSyncExternalStore), NOT the settings
// KV — the KV's async read arrives after first paint, and a masked balance
// flashing unmasked is a privacy leak, not a cosmetic one. The before-
// first-paint half lives in index.html's inline script (the theme
// anti-flash mirror), which applies the class before React mounts.
//
// DEFAULT OFF: an unset key reads false — the entire suite's dollar
// assertions depend on this. FAIL-SAFE MASKED: a localStorage FAILURE
// (not absence) resolves to true — uncertainty hides, never leaks.

import { useCallback, useSyncExternalStore } from 'react'

export const STREAMER_STORAGE_KEY = 'fugaedge-streamer'

export function readStreamerMode(): boolean {
  try {
    return localStorage.getItem(STREAMER_STORAGE_KEY) === 'on'
  } catch {
    return true // fail-safe: uncertainty resolves to MASKED
  }
}

/** Apply/remove the CSS key. Idempotent; the inline script does this once
 *  before paint, we re-do it on every change so the toggle needs no reload. */
export function applyStreamerMode(on: boolean): void {
  document.documentElement.classList.toggle('streamer', on)
}

type Listener = () => void
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of [...listeners]) l()
}

export function subscribeStreamerMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setStreamerMode(on: boolean): void {
  try {
    localStorage.setItem(STREAMER_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // persistence failed — the session still masks/unmasks live
  }
  applyStreamerMode(on)
  emit()
}

/** Component-facing hook — the TopBar toggle (and any future consumer). */
export function useStreamerMode(): { on: boolean; setOn: (next: boolean) => void } {
  const on = useSyncExternalStore(subscribeStreamerMode, readStreamerMode, () => false)
  const setOn = useCallback((next: boolean) => {
    setStreamerMode(next)
  }, [])
  return { on, setOn }
}

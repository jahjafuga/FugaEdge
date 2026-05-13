import { useCallback, useEffect, useSyncExternalStore } from 'react'

// Theme mode the user has chosen. 'system' follows the OS-level
// prefers-color-scheme media query; 'dark'/'light' are explicit.
export type ThemeMode = 'dark' | 'light' | 'system'

// The actual rendered theme — derived from the user's mode + OS pref.
// Always one of these two; never 'system'.
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'fugaedge-theme'

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ignore — localStorage may be unavailable
  }
  return 'system'
}

function systemPref(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemPref() : mode
}

// Apply the resolved theme to the <html> element. The anti-flash script
// in index.html does this once before React mounts; we do it again on
// every change so the toggle works without a reload.
export function applyTheme(resolved: ResolvedTheme): void {
  const cls = document.documentElement.classList
  if (resolved === 'light') cls.add('light')
  else cls.remove('light')
}

// Tiny external store so multiple components can subscribe to mode changes.
// Backed by localStorage; survives reloads.
type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

function setStoredMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
  emit()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// `useSyncExternalStore` gives us a fresh read on every render + subscribes
// to changes. Both the TopBar toggle and Settings radio share this state.
export function useThemeMode(): {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (next: ThemeMode) => void
} {
  const mode = useSyncExternalStore(
    subscribe,
    readStoredMode,
    // SSR fallback — Electron renderer always has window, but TS is happy.
    () => 'dark' as ThemeMode,
  )

  // Re-read system pref when mode is 'system' AND OS preference changes.
  // We don't store the resolved value — it's derived on each render.
  const resolved = resolveTheme(mode)

  const setMode = useCallback((next: ThemeMode) => {
    setStoredMode(next)
    applyTheme(resolveTheme(next))
  }, [])

  // Listen for OS-level preference changes while mode === 'system' so the
  // UI follows immediately if the user switches their OS theme.
  useEffect(() => {
    if (mode !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      applyTheme(systemPref())
      emit() // trigger re-render in subscribed components
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  // Ensure the <html> class matches the resolved value on every change.
  // Idempotent — same DOM op every time.
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  return { mode, resolved, setMode }
}

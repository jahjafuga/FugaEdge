import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeMode } from '@/lib/theme'

// Pin the renderer-side theme key so it persists at the fixed
// 'fugaedge-theme' localStorage key. localStorage-only, no IPC. This
// vitest jsdom env ships no working localStorage, so install an
// in-memory mock the assertion shares.
function installMockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
}

beforeEach(() => {
  installMockLocalStorage()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localStorage key stability — theme key', () => {
  it('theme persists at the fixed fugaedge-theme key', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.setMode('dark'))
    expect(localStorage.getItem('fugaedge-theme')).toBe('dark')
  })
})

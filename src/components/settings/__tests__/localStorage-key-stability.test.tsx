import { fireEvent, render, screen, renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsAccordion, { settingsAccordionKey } from '../SettingsAccordion'
import { useThemeMode } from '@/lib/theme'

// RED-lock #5 — pin the renderer-side localStorage keys so regrouping sections
// into panes can't shift them. No IPC: both surfaces are localStorage-only.
// This vitest jsdom env ships no working localStorage, so install an in-memory
// mock the components + assertions share.
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

describe('localStorage key stability — accordion expand keys', () => {
  // The storageKeys of the sections that will be relocated into panes.
  it.each(['journalRules', 'dayTags', 'dailyRuleBreaks', 'trash'])(
    'SettingsAccordion(%s) persists at fuga.settings.<key>.expanded',
    (key) => {
      expect(settingsAccordionKey(key)).toBe(`fuga.settings.${key}.expanded`)

      render(
        <SettingsAccordion storageKey={key} title="Section">
          body
        </SettingsAccordion>,
      )
      // The value-effect writes the initial collapsed state on mount.
      expect(localStorage.getItem(`fuga.settings.${key}.expanded`)).toBe('0')
      // Toggling flips the SAME key — never a mount-position-derived one.
      fireEvent.click(screen.getByRole('button'))
      expect(localStorage.getItem(`fuga.settings.${key}.expanded`)).toBe('1')
    },
  )
})

describe('localStorage key stability — theme key', () => {
  it('theme persists at the fixed fugaedge-theme key', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.setMode('dark'))
    expect(localStorage.getItem('fugaedge-theme')).toBe('dark')
  })
})

// @vitest-environment jsdom
//
// Beat 4 build A1 — the streamer-mode store: localStorage-backed external
// store mirroring theme.ts's shape (listener Set + useSyncExternalStore
// read). Default OFF when the key is unset (the whole suite's dollar
// assertions depend on it); the FAIL-SAFE direction is MASKED — a
// localStorage failure resolves to hidden, never to a leak. Setting the
// mode applies the 'streamer' class to <html> (the CSS primitive's key).

import { describe, it, expect, beforeEach, vi } from 'vitest'

// This vitest jsdom ships no working localStorage — install the in-memory
// shim (the house pattern from the Calendar/Analytics scope tests).
const mem = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  },
})

import {
  readStreamerMode,
  setStreamerMode,
  subscribeStreamerMode,
  STREAMER_STORAGE_KEY,
} from '../streamerMode'

beforeEach(() => {
  localStorage.removeItem(STREAMER_STORAGE_KEY)
  document.documentElement.classList.remove('streamer')
})

describe('streamerMode — the external store', () => {
  it('DEFAULT OFF: reads false when the key is unset', () => {
    expect(readStreamerMode()).toBe(false)
  })

  it('set(true) persists, applies the html class, and notifies subscribers; a re-read returns true', () => {
    const cb = vi.fn()
    const off = subscribeStreamerMode(cb)
    setStreamerMode(true)
    expect(localStorage.getItem(STREAMER_STORAGE_KEY)).toBe('on')
    expect(document.documentElement.classList.contains('streamer')).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(readStreamerMode()).toBe(true)
    off()
  })

  it('set(false) removes the html class and persists off', () => {
    setStreamerMode(true)
    setStreamerMode(false)
    expect(document.documentElement.classList.contains('streamer')).toBe(false)
    expect(readStreamerMode()).toBe(false)
  })

  it('unsubscribe stops delivery', () => {
    const cb = vi.fn()
    const off = subscribeStreamerMode(cb)
    setStreamerMode(true)
    off()
    setStreamerMode(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('FAIL-SAFE MASKED: a throwing localStorage read resolves to true (hidden), never a leak', () => {
    const spy = vi
      .spyOn(globalThis.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(readStreamerMode()).toBe(true)
    spy.mockRestore()
  })
})

// @vitest-environment jsdom
//
// Beat 4 build A1 — the header eye-icon toggle (sits beside ThemeToggle;
// same h-9 w-9 shape). Flips the streamer store; aria-pressed and the
// label track the state. Icon semantics: Eye when dollars show (click to
// hide), EyeOff when hidden (click to show).

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

// This vitest jsdom ships no working localStorage — the house in-memory shim.
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

import StreamerToggle from '../StreamerToggle'
import { STREAMER_STORAGE_KEY, readStreamerMode } from '@/lib/streamerMode'

beforeEach(() => {
  localStorage.removeItem(STREAMER_STORAGE_KEY)
  document.documentElement.classList.remove('streamer')
})

describe('StreamerToggle', () => {
  it('renders OFF by default: aria-pressed=false, the hide label', () => {
    render(<StreamerToggle />)
    const btn = screen.getByRole('button', { name: /hide dollar amounts/i })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking flips the store on (persisted + html class) and the button reflects it', () => {
    render(<StreamerToggle />)
    fireEvent.click(screen.getByRole('button', { name: /hide dollar amounts/i }))
    expect(readStreamerMode()).toBe(true)
    expect(document.documentElement.classList.contains('streamer')).toBe(true)
    const btn = screen.getByRole('button', { name: /show dollar amounts/i })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('a second click flips back off', () => {
    render(<StreamerToggle />)
    fireEvent.click(screen.getByRole('button', { name: /hide dollar amounts/i }))
    fireEvent.click(screen.getByRole('button', { name: /show dollar amounts/i }))
    expect(readStreamerMode()).toBe(false)
    expect(document.documentElement.classList.contains('streamer')).toBe(false)
  })
})

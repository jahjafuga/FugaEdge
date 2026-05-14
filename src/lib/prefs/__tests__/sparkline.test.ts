import { describe, it, expect, beforeEach } from 'vitest'
import {
  SHOW_SPARKLINE_STORAGE_KEY,
  readShowSparkline,
  writeShowSparkline,
} from '../sparkline'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null }
  get length() { return this.m.size }
}

beforeEach(() => {
  // @ts-expect-error — node env: install a minimal localStorage for the test
  globalThis.localStorage = new MemoryStorage()
})

describe('sparkline preference', () => {
  it('uses the documented localStorage key', () => {
    expect(SHOW_SPARKLINE_STORAGE_KEY).toBe('fuga.trades.showSparkline')
  })

  it('defaults to false when nothing is persisted', () => {
    expect(readShowSparkline()).toBe(false)
  })

  it('round-trips true', () => {
    writeShowSparkline(true)
    expect(readShowSparkline()).toBe(true)
    expect(globalThis.localStorage.getItem(SHOW_SPARKLINE_STORAGE_KEY)).toBe('1')
  })

  it('round-trips false explicitly', () => {
    writeShowSparkline(true)
    writeShowSparkline(false)
    expect(readShowSparkline()).toBe(false)
    expect(globalThis.localStorage.getItem(SHOW_SPARKLINE_STORAGE_KEY)).toBe('0')
  })
})

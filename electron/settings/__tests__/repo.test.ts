import { describe, it, expect, beforeEach, vi } from 'vitest'

// First settings-repo tests, added with §H's show_macd_pane field. better-sqlite3
// doesn't load under vitest, so an in-memory KV table stands in behind the
// openDatabase mock (the capturing-shim pattern from
// listTradesWithTechnicals.test.ts) — but STATEFUL: getSettings reads the map and
// saveSettings upserts into it, so save → get roundtrips. Hoisted so tests can
// seed raw values and reset between cases.
const { store } = vi.hoisted(() => ({
  store: { current: {} as Record<string, string> },
}))

vi.mock('../../db/database', () => ({
  getDbPath: () => '/fake/db/path',
  openDatabase: () => ({
    prepare: (sql: string) => {
      if (/^\s*SELECT/i.test(sql)) {
        return {
          all: () =>
            Object.entries(store.current).map(([key, value]) => ({ key, value })),
        }
      }
      // INSERT ... ON CONFLICT(key) DO UPDATE — the upsert.
      return {
        run: (key: string, value: string) => {
          store.current[key] = value
        },
      }
    },
    transaction: (fn: () => void) => () => fn(),
  }),
}))

// SUT imported after the mock.
import { getSettings, saveSettings } from '../repo'

beforeEach(() => {
  store.current = {}
})

describe('settings repo — show_macd_pane (§H)', () => {
  it('(R1) default-on: a fresh KV map yields show_macd_pane true', () => {
    expect(getSettings().values.show_macd_pane).toBe(true)
  })

  it('(R2) parseBoolean: "0" → false, "1" → true, garbage → default', () => {
    store.current = { show_macd_pane: '0' }
    expect(getSettings().values.show_macd_pane).toBe(false)
    store.current = { show_macd_pane: '1' }
    expect(getSettings().values.show_macd_pane).toBe(true)
    store.current = { show_macd_pane: 'wat' }
    expect(getSettings().values.show_macd_pane).toBe(true) // falls back to default
  })

  it('(R3) write/read roundtrip: saveSettings persists false, then true', () => {
    saveSettings({ show_macd_pane: false })
    expect(store.current.show_macd_pane).toBe('0') // encoded as '0'
    expect(getSettings().values.show_macd_pane).toBe(false)

    saveSettings({ show_macd_pane: true })
    expect(store.current.show_macd_pane).toBe('1')
    expect(getSettings().values.show_macd_pane).toBe(true)
  })

  it('(R4) Partial upsert: writing show_macd_pane leaves other fields untouched', () => {
    saveSettings({ max_daily_loss: 999 })
    saveSettings({ show_macd_pane: false })
    const { values } = getSettings()
    expect(values.show_macd_pane).toBe(false)
    expect(values.max_daily_loss).toBe(999) // the second save did not clobber it
  })

  it('(R5/L24) stored_keys exposes raw row existence — fresh map empty, saved key present', () => {
    expect(getSettings().stored_keys).toEqual([])
    saveSettings({ account_size: 50000 })
    expect(getSettings().stored_keys).toContain('account_size')
  })
})

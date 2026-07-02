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
  it('(R1) default-off (B1): a fresh KV map yields show_macd_pane false', () => {
    expect(getSettings().values.show_macd_pane).toBe(false)
  })

  it('(R2) parseBoolean: "0" → false, "1" → true, garbage → default (now false)', () => {
    store.current = { show_macd_pane: '0' }
    expect(getSettings().values.show_macd_pane).toBe(false)
    store.current = { show_macd_pane: '1' }
    expect(getSettings().values.show_macd_pane).toBe(true)
    store.current = { show_macd_pane: 'wat' }
    expect(getSettings().values.show_macd_pane).toBe(false) // falls back to the new default-off
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

describe('settings repo — daily_rule_break_list (Daily Rule Breaks Phase 1)', () => {
  it('default: a fresh KV map yields an empty list', () => {
    expect(getSettings().values.daily_rule_break_list).toEqual([])
  })

  it('parseStringArray: a stored JSON array reads back as string[]', () => {
    store.current = {
      daily_rule_break_list: '["Ignored daily max loss","Gave back >30% after daily goal"]',
    }
    expect(getSettings().values.daily_rule_break_list).toEqual([
      'Ignored daily max loss',
      'Gave back >30% after daily goal',
    ])
  })

  it('write/read roundtrip: saveSettings persists JSON, getSettings parses it back', () => {
    const list = ['Gave back >30% after daily goal', 'Ignored daily max loss']
    saveSettings({ daily_rule_break_list: list })
    expect(store.current.daily_rule_break_list).toBe(JSON.stringify(list))
    expect(getSettings().values.daily_rule_break_list).toEqual(list)
  })

  it('clean: blank / whitespace entries are trimmed and dropped on save', () => {
    saveSettings({ daily_rule_break_list: ['  Keep  ', '', '   ', 'Also'] })
    expect(getSettings().values.daily_rule_break_list).toEqual(['Keep', 'Also'])
  })

  it('partial upsert: writing the list leaves other fields untouched', () => {
    saveSettings({ max_daily_loss: 999 })
    saveSettings({ daily_rule_break_list: ['X'] })
    const { values } = getSettings()
    expect(values.daily_rule_break_list).toEqual(['X'])
    expect(values.max_daily_loss).toBe(999)
  })
})

describe('settings repo — account_scope (multi-account Beat 4)', () => {
  it("defaults to 'all' on a fresh KV map", () => {
    expect(getSettings().values.account_scope).toBe('all')
  })

  it('write/read roundtrip: persists an account ULID and reads it back', () => {
    saveSettings({ account_scope: '01HXACCOUNTULID' })
    expect(store.current.account_scope).toBe('01HXACCOUNTULID')
    expect(getSettings().values.account_scope).toBe('01HXACCOUNTULID')
  })

  it('a blank write is dropped (guarded), leaving the stored value untouched', () => {
    saveSettings({ account_scope: 'all' })
    saveSettings({ account_scope: '   ' })
    expect(getSettings().values.account_scope).toBe('all')
  })
})

describe('settings repo — indicator toggles (B1: EMA9 / EMA20 / VWAP persistence)', () => {
  it('all three default OFF on a fresh KV map', () => {
    const { values } = getSettings()
    expect(values.show_ema9).toBe(false)
    expect(values.show_ema20).toBe(false)
    expect(values.show_vwap).toBe(false)
  })

  it('parseBoolean per key: "1" → true, "0" → false, garbage → default-off', () => {
    store.current = { show_ema9: '1', show_ema20: '0', show_vwap: 'wat' }
    const { values } = getSettings()
    expect(values.show_ema9).toBe(true)
    expect(values.show_ema20).toBe(false)
    expect(values.show_vwap).toBe(false) // garbage → default-off
  })

  it('write/read roundtrip: each persists independently as "1" / "0"', () => {
    saveSettings({ show_ema9: true, show_vwap: true })
    expect(store.current.show_ema9).toBe('1')
    expect(store.current.show_vwap).toBe('1')
    const afterOn = getSettings().values
    expect(afterOn.show_ema9).toBe(true)
    expect(afterOn.show_ema20).toBe(false) // never written → default-off
    expect(afterOn.show_vwap).toBe(true)

    saveSettings({ show_ema9: false })
    expect(store.current.show_ema9).toBe('0')
    expect(getSettings().values.show_ema9).toBe(false)
  })
})

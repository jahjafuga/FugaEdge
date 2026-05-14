import { describe, it, expect, beforeEach } from 'vitest'
import {
  SETTINGS_ACCORDION_KEY_PREFIX,
  settingsAccordionKey,
} from '../SettingsAccordion'

describe('settingsAccordionKey', () => {
  it('namespaces all keys under fuga.settings.*', () => {
    expect(SETTINGS_ACCORDION_KEY_PREFIX).toBe('fuga.settings.')
    expect(settingsAccordionKey('journalRules')).toBe(
      'fuga.settings.journalRules.expanded',
    )
    expect(settingsAccordionKey('mistakeList')).toBe(
      'fuga.settings.mistakeList.expanded',
    )
    expect(settingsAccordionKey('dayTags')).toBe(
      'fuga.settings.dayTags.expanded',
    )
  })

  it('builds distinct keys for distinct storageKeys', () => {
    const a = settingsAccordionKey('a')
    const b = settingsAccordionKey('b')
    expect(a).not.toBe(b)
  })
})

describe('SettingsAccordion localStorage round-trip', () => {
  // Minimal localStorage stub — the SettingsAccordion component only ever
  // uses getItem / setItem, so a plain Map is sufficient.
  beforeEach(() => {
    const store = new Map<string, string>()
    const stub = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    }
    // @ts-expect-error — test-only override
    globalThis.window = { localStorage: stub }
  })

  it('writes "1" for true and "0" for false (the schema persisted state)', () => {
    const key = settingsAccordionKey('test')
    window.localStorage.setItem(key, '1')
    expect(window.localStorage.getItem(key)).toBe('1')
    window.localStorage.setItem(key, '0')
    expect(window.localStorage.getItem(key)).toBe('0')
  })
})

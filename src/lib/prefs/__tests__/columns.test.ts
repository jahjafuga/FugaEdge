// @vitest-environment jsdom
// v0.2.7 Feature 4, Commit 1 — one visibility mechanism, one key.
//
// Before this, column visibility lived in FOUR localStorage keys, read in useState
// initialisers, written in useEffects, and passed down as booleans the table used to
// splice its column array. The props and the table's own idea of its columns were two
// sources that could disagree. These pin the fold, and that symbol can never be lost.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COLUMN_PREFS_KEY,
  DEFAULT_COLUMN_VISIBILITY,
  UNHIDEABLE_COLUMN,
  readColumnVisibility,
  resetColumnVisibility,
  writeColumnVisibility,
} from '../columns'

beforeEach(() => localStorage.clear())
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('column visibility prefs', () => {
  it('T2 a written choice survives a reload (a fresh read)', () => {
    writeColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, fees: false, mae: true })
    const back = readColumnVisibility()
    expect(back.fees).toBe(false)
    expect(back.mae).toBe(true)
  })

  it('T3 STAND-DOWN: a virgin store yields exactly the shipped defaults', () => {
    const v = readColumnVisibility()
    expect(v.country).not.toBe(false) // visible today
    expect(v.catalyst).toBe(false)
    expect(v.mistakes).toBe(false)
    expect(v.float).toBe(false)
    expect(v.spark).toBe(false)
    expect(v.net_pnl).not.toBe(false)
  })

  it('T5a symbol cannot be hidden — not by writing, not by a hand-edited store', () => {
    writeColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, [UNHIDEABLE_COLUMN]: false })
    expect(readColumnVisibility()[UNHIDEABLE_COLUMN]).toBe(true)

    localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ symbol: false, fees: false }))
    expect(readColumnVisibility()[UNHIDEABLE_COLUMN]).toBe(true)
  })

  it('T5b reset restores defaults from ANY state, including all-hidden-but-symbol', () => {
    const allHidden: Record<string, boolean> = {}
    for (const k of Object.keys(DEFAULT_COLUMN_VISIBILITY)) allHidden[k] = false
    allHidden.country = false
    allHidden.net_pnl = false
    writeColumnVisibility(allHidden)
    expect(readColumnVisibility().net_pnl).toBe(false)

    const after = resetColumnVisibility()
    expect(after.net_pnl).not.toBe(false)
    expect(after.country).not.toBe(false)
    expect(after.catalyst).toBe(false)
    expect(after[UNHIDEABLE_COLUMN]).toBe(true)
    expect(readColumnVisibility().net_pnl).not.toBe(false) // and it persisted
  })

  it('T7 the four OLD keys are HONOURED on first read, not silently discarded', () => {
    localStorage.setItem('fuga.trades.showSparkline', '1')
    localStorage.setItem('trades.showCountryColumn', '0')
    localStorage.setItem('trades.showCatalystColumn', '1')
    localStorage.setItem('trades.showMistakesColumn', '1')

    const v = readColumnVisibility()
    expect(v.spark).toBe(true)
    expect(v.country).toBe(false)
    expect(v.catalyst).toBe(true)
    expect(v.mistakes).toBe(true)
  })

  it('T7b the new key WINS once written — the fold is one-time, not sticky', () => {
    localStorage.setItem('trades.showCatalystColumn', '1')
    writeColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, catalyst: false })
    expect(readColumnVisibility().catalyst).toBe(false)
  })

  it('a corrupt store falls back to defaults rather than throwing', () => {
    localStorage.setItem(COLUMN_PREFS_KEY, '{not json')
    expect(() => readColumnVisibility()).not.toThrow()
    expect(readColumnVisibility().catalyst).toBe(false)
  })

  it('T6 ONE MECHANISM: no show*Column prop remains on TradesTable', () => {
    const table = src('src/components/trades/TradesTable.tsx')
    for (const prop of [
      'showFloatColumn', 'showCountryColumn', 'showCatalystColumn',
      'showMistakesColumn', 'showSparkline',
    ]) {
      expect(table).not.toContain(prop)
    }
    // and the page no longer keeps its own copies
    const page = src('src/pages/Trades.tsx')
    expect(page).not.toContain('COUNTRY_COL_STORAGE_KEY')
    expect(page).not.toContain('CATALYST_COL_STORAGE_KEY')
    expect(page).not.toContain('MISTAKES_COL_STORAGE_KEY')
  })
})

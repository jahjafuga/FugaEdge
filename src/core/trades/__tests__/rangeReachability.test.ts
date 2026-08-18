// v0.2.7 Feature 4, Commit 5 — T30, the guard that would have caught what shipped.
//
// Commit 3 built the range engine, wired it into the filter, and tested it thoroughly.
// It was also unreachable: nothing populated TradesFilterState.ranges, so a fully
// working, fully tested filter could not be used by anyone. Passing tests said the
// feature worked; the feature did not exist.
//
// This asserts the chain end to end at the source level: every numeric column the
// filter bar offers must resolve a value in rangeValueOf, and every id rangeValueOf
// resolves must be offered. Neither half can drift without failing.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NUMERIC_COLUMN_IDS, COLUMN_LABELS } from '@/lib/prefs/columns'
import { rangeValueOf } from '../tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('T30 NO DEAD ENGINE — every numeric column is reachable', () => {
  it('every offered column resolves a value in rangeValueOf', () => {
    const t = makeTrade({})
    for (const id of NUMERIC_COLUMN_IDS) {
      // Resolving to null is fine (an unmeasured field); throwing or falling through
      // to the default branch is not — that would be a column with no filterable value.
      expect(() => rangeValueOf(t, id), `${id} threw`).not.toThrow()
      const known = src('src/core/trades/tradesFilter.ts')
      expect(known, `${id} has no case in rangeValueOf`).toContain(`case '${id}':`)
    }
  })

  it('every column rangeValueOf handles is OFFERED to the user', () => {
    const filter = src('src/core/trades/tradesFilter.ts')
    const cases = Array.from(filter.matchAll(/case '([a-z_0-9]+)':/g)).map((m) => m[1])
    for (const id of cases) {
      expect(
        (NUMERIC_COLUMN_IDS as readonly string[]).includes(id),
        `rangeValueOf handles '${id}' but the filter bar never offers it`,
      ).toBe(true)
    }
  })

  it('the filter bar actually RENDERS inputs bound to the range state', () => {
    const bar = src('src/components/trades/TradesFilters.tsx')
    expect(bar).toContain('numericColumns')
    expect(bar).toMatch(/filters\.ranges\?\.\[c\.id\]\?\.min/)
    expect(bar).toMatch(/filters\.ranges\?\.\[c\.id\]\?\.max/)
    // and the page supplies them
    const page = src('src/pages/Trades.tsx')
    expect(page).toContain('numericColumns={numericColumns}')
  })

  it('every offered column has a human label', () => {
    for (const id of NUMERIC_COLUMN_IDS) {
      expect(COLUMN_LABELS[id], `${id} has no label`).toBeTruthy()
      expect(COLUMN_LABELS[id]).not.toBe(id)
    }
  })
})

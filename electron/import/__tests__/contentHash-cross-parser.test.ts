import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTradeHistoryCsv } from '../parse-tradehistory'
import { parseTradesWindowCsv } from '../parse-trades-window'
import { hashFillsByContent } from '@/core/import/build-round-trips'
import type { Execution } from '@shared/import-types'

// End-to-end cross-parser dedup contract. Closes the gap noted on
// 2026-05-27: the existing contentHash tests use hand-constructed
// Execution arrays with hardcoded synthetic-ID prefixes, never actual
// parser output. This test pipes matched CSV fixtures (same logical
// fills expressed in DAS TradeHistory + DAS trades_window shapes)
// through their respective parsers and asserts the resulting Executions
// hash identically under hashFillsByContent.
//
// If this ever fails, the diff helper surfaces WHICH content tuple
// field is responsible (timestamp format, qty type, side casing, price
// precision, symbol case) so the failure tells you the cause, not just
// that there's a cause.
//
// Co-located with the parser tests at electron/import/__tests__/ rather
// than under src/core/import/ because vitest's path alias only resolves
// '@/' to src/ — importing the parsers from a src/-rooted test would
// require an ugly cross-tree relative path. Filed
// docs/plans/v0.3.0-or-later-ideas.md → "Move pure parsers from
// electron/import/ to src/core/import/" for the architectural cleanup
// that would let this test live with its src/core subject.

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'cross-parser')

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8')
}

interface ContentTuple {
  symbol: string
  time: string
  side: string
  qty: number
  price: number
}

function tupleFor(e: Execution): ContentTuple {
  return {
    symbol: e.symbol,
    time: e.time,
    side: e.side,
    qty: e.qty,
    price: e.price,
  }
}

// Diff helper: returns a human-readable description of which fields
// differ between two Execution objects. Excludes trade_id / order_id /
// account_name on purpose — those are NOT in hashFillsByContent's
// payload, so a diff there isn't the cause of a hash mismatch.
function diffContent(a: Execution, b: Execution): string {
  const ta = tupleFor(a)
  const tb = tupleFor(b)
  const lines: string[] = []
  for (const k of Object.keys(ta) as (keyof ContentTuple)[]) {
    const va = ta[k]
    const vb = tb[k]
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      const tagA = typeof va === 'string' ? `"${va}"` : String(va)
      const tagB = typeof vb === 'string' ? `"${vb}"` : String(vb)
      lines.push(`    ${k}: tradehistory=${tagA} (${typeof va}) vs trades_window=${tagB} (${typeof vb})`)
    }
  }
  return lines.length > 0
    ? lines.join('\n')
    : '    (no content-field differences — issue must be inside hashFillsByContent itself)'
}

describe('cross-parser content_hash equality (TradeHistory ↔ trades_window)', () => {
  it('emits identical content_hash per fill for matched round-trip fixtures', () => {
    const thCsv = loadFixture('test-tradehistory.csv')
    const twCsv = loadFixture('test-trades-window.csv')

    const thRes = parseTradeHistoryCsv(thCsv, 'test-tradehistory.csv')
    // trades_window has bare HH:MM:SS time, so the parser needs the date
    // from the filename. Pattern follows the existing
    // parse-trades-window.test.ts convention: `trades_YYYY-MM-DD.csv`.
    const twRes = parseTradesWindowCsv(twCsv, 'trades_2026-04-02.csv')

    // Sanity — both parsers ingested every row.
    expect(thRes.skipped).toBe(0)
    expect(twRes.skipped).toBe(0)
    expect(thRes.executions).toHaveLength(4)
    expect(twRes.executions).toHaveLength(4)

    // Sort defensively by time so the per-index pairing is stable even
    // if a future parser change returns rows in a different order.
    const thSorted = [...thRes.executions].sort((a, b) =>
      a.time.localeCompare(b.time),
    )
    const twSorted = [...twRes.executions].sort((a, b) =>
      a.time.localeCompare(b.time),
    )

    // Per-fill content_hash equality. Each fill's hash is computed in
    // isolation so the failure message can pinpoint which fill (and via
    // diffContent, which field) is responsible.
    const mismatches: string[] = []
    for (let i = 0; i < thSorted.length; i++) {
      const th = thSorted[i]
      const tw = twSorted[i]
      const thHash = hashFillsByContent([th])
      const twHash = hashFillsByContent([tw])
      if (thHash !== twHash) {
        mismatches.push(
          `Fill index ${i}:\n` +
            `    tradehistory  content_hash = ${thHash}\n` +
            `    trades_window content_hash = ${twHash}\n` +
            `  Field-level diff:\n${diffContent(th, tw)}`,
        )
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `Per-fill content_hash mismatch in ${mismatches.length} of ${thSorted.length} fills:\n\n` +
          mismatches.join('\n\n'),
      )
    }

    // Whole-trip content_hash equality — the unit dedup actually keys on.
    const thTripHash = hashFillsByContent(thSorted)
    const twTripHash = hashFillsByContent(twSorted)
    if (thTripHash !== twTripHash) {
      const fillDiffs: string[] = []
      for (let i = 0; i < thSorted.length; i++) {
        fillDiffs.push(`  Fill ${i}:\n${diffContent(thSorted[i], twSorted[i])}`)
      }
      throw new Error(
        'Whole-trip content_hash mismatch despite per-fill match:\n' +
          `    tradehistory  trip content_hash = ${thTripHash}\n` +
          `    trades_window trip content_hash = ${twTripHash}\n` +
          'Per-fill content tuples:\n' +
          fillDiffs.join('\n'),
      )
    }
  })
})

// BEAT 293/295 -- the demo generator obeys the app's excursion contract.
//
// The contract is stated twice in the codebase: the migration comment
// (electron/db/database.ts:1258-1267, "Always >= 0" for both columns) and the
// row doc (shared/trades-types.ts:68-70, "Both >= 0"). The REAL writer
// (electron/market/intraday.ts:348-354) has clamped since the initial commit.
// The demo seeder was the one author of negative MAE (beat 285's finding:
// three sites) and of MAE values SMALLER than the trade's own realised loss
// (beat 294's recount: 38 of 56 losers), so these guards read the SCRIPT AS
// TEXT. They live under src/test because vitest's include does not reach
// scripts/ (vitest.config.ts:18-22).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const seederSource = () => readFileSync(join(process.cwd(), 'scripts/demo-seed.mjs'), 'utf8')

/** The seeder's lines, CR stripped so the split needs no escape gymnastics. */
const seederLines = () => seederSource().split(String.fromCharCode(13)).join('').split(String.fromCharCode(10))

describe('G30 the demo seeder writes excursions as magnitudes', () => {
  it('no negated per-share expression and no negative mae/mfe literal', () => {
    const src = seederSource()
    const negatedAbs = src.split('-Math.abs(perShare)').length - 1
    const maeNeg = src.split('mae: -').length - 1
    const mfeNeg = src.split('mfe: -').length - 1
    // DECLARED RED at birth (beat 293): 1 + 2 + 0 = 3 hits at :1175, :1355, :1467.
    expect(negatedAbs, 'a negated Math.abs(perShare) survives in the seeder').toBe(0)
    expect(maeNeg, 'a negative mae literal survives in the seeder').toBe(0)
    expect(mfeNeg, 'a negative mfe literal survives in the seeder').toBe(0)
  })
})

describe('G32 a losing demo trade cannot get an MAE below its own loss', () => {
  it('the mae factor floors at 1.0 for losers and keeps 0.3 for winners', () => {
    const line = seederLines().find((l) => l.includes('const maeFactor')) ?? ''
    expect(line, 'no maeFactor line found').toContain('between(rTrade')
    // TOLERANT TO SPACING by collapsing runs of whitespace first, then
    // anchored on the block's OWN loser test (tp.pnl, as used at :1013 and
    // :1223). Both floors must appear: 1.0 for the losing arm, and 0.3 kept
    // for winners, whose MAE may honestly sit under their move.
    const flat = line.split(/\s+/).join(' ')
    expect(
      flat.includes('tp.pnl < 0 ? 1.0 : 0.3'),
      'the mae factor has no 1.0 loser floor: ' + line.trim(),
    ).toBe(true)
    // mfeFactor is untouched by this beat: its 1.0 floor is why MFE has
    // never violated (beat 294: 0 of 84 winners).
    const mfe = seederLines().find((l) => l.includes('const mfeFactor')) ?? ''
    expect(mfe).toContain('between(rTrade, 1.0, 2.6)')
  })
})

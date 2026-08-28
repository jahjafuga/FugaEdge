// @vitest-environment jsdom
//
// v0.2.7 — CATALYST: PINNING WHAT RECON MEASURED.
//
// Beats one hundred and thirty-eight through one hundred and forty asked whether
// the catalyst filter is broken. The answer was: not in the product.
//
//   BEAT 138 measured, on the demo book, that zero of nine distinct stored
//   catalyst values and zero of one hundred and thirty tagged trades can ever
//   match the vocabulary, because the vocabulary is built from catalyst_def
//   names and the matcher is exact string equality against a free-text column.
//
//   BEAT 139 measured the same thing on the one human-kept book available and
//   got the OPPOSITE result: three of three distinct values and eight of eight
//   tagged trades matched exactly. It also read the editor and found a <select>
//   over catalyst_def whose option value is the definition name, with no
//   free-text path anywhere in it.
//
//   BEAT 140 traced the last unread writer. The import creates trades with a
//   thirty-three column list that EXCLUDES catalyst_type — zero mentions of
//   catalyst across the whole import directory against three hundred and
//   eighty-one for symbol — so an imported trade is born untagged.
//
// TAKEN TOGETHER: no writer in the shipped app can put a non-definition string
// into trades.catalyst_type. The demo book's nine sentences are a FIXTURE
// ARTEFACT written by something that is not the app, and the founder ruled that
// the fixture stays exactly as it is, because it is the only book that exercises
// an orphan catalyst string at all.
//
// So these guards do not fix anything. They pin the three facts that made
// "leave the product alone" the right call, so that if any of them stops being
// true the next person finds out from a failing test rather than from a trader.
//
// THE ONE GENUINELY UNGUARDED GAP is seed drift, and RC3 is the only thing
// standing in front of it. The seed list is inserted ONLY into an empty table,
// and nothing propagates a seed rename onto trade rows — the one path that does
// rewrite them fires solely on a USER rename. Seeds have already changed twice,
// and each time it took a hand-written migration to repair. RC3 is a literal
// list on purpose: a derived expectation would be a tautology and would sit
// silently through exactly the change that matters.

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CatalystEditor from '../CatalystEditor'
import { SEED as CATALYST_SEED } from '../../../../electron/db/migrate-catalyst-vocabulary'

/** Deliberately NOT the shipped seed list. These are arbitrary names chosen so
 *  that an option value echoing anything other than the definition name — an
 *  id, a slug, an index — is visibly wrong rather than accidentally right. */
const DEFS = [
  { id: 7, name: 'Halt Resume', sort_position: 0, is_custom: 0, is_archived: 0, kind: 'news' },
  { id: 9, name: 'Reverse Split', sort_position: 1, is_custom: 1, is_archived: 0, kind: 'news' },
  { id: 4, name: 'Zzzq Probe', sort_position: 2, is_custom: 1, is_archived: 0, kind: 'none' },
]

vi.mock('@/lib/ipc', () => ({
  ipc: { catalystDefsGet: vi.fn(() => Promise.resolve(DEFS)) },
}))

const ROOT = resolve(__dirname, '..', '..', '..', '..')
const read = (...parts: string[]) => readFileSync(resolve(ROOT, ...parts), 'utf8')

// --- RC1 : THE EDITOR EMITS DEFINITION NAMES --------------------------------

/** RENDERED, not grepped. A search for the JSX would find the expression that
 *  is supposed to produce this and prove nothing about what the component
 *  actually puts in the DOM. */
describe('RC1 the catalyst editor offers definition names and no free text', () => {
  const setup = () =>
    render(<CatalystEditor catalystType={null} daysSince={null} onChange={vi.fn()} />)

  it('every option value is a definition NAME, read off the DOM', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelectorAll('option').length).toBeGreaterThan(1))
    const values = [...container.querySelectorAll('option')]
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '')
    expect(values).toEqual(DEFS.map((d) => d.name))
  })

  it('the catalyst control is a SELECT, and nothing there takes free text', async () => {
    const { container } = setup()
    await waitFor(() => expect(container.querySelector('select')).not.toBeNull())
    // The only input in this component is the numeric days-since field. A text
    // input would be the free-text path this whole recon ruled out.
    const inputs = [...container.querySelectorAll('input')]
    expect(inputs.map((i) => (i as HTMLInputElement).type)).toEqual(['number'])
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0)
  })

  it('and a value absent from the list survives as its own option', async () => {
    render(<CatalystEditor catalystType="Legacy Orphan String" daysSince={null} onChange={vi.fn()} />)
    // Beat 140: this "(current)" branch is the ONLY way the editor can emit a
    // non-definition value, and it can only ever echo what was already stored.
    await waitFor(() => expect(screen.getByText(/Legacy Orphan String/)).toBeTruthy())
  })
})

// --- RC2 : THE IMPORT DOES NOT WRITE catalyst_type --------------------------

describe('RC2 the import creates trades without a catalyst', () => {
  const src = read('electron', 'import', 'repo.ts')
  const columns = (() => {
    const at = src.indexOf('INSERT OR IGNORE INTO trades (')
    const open = src.indexOf('(', at)
    const close = src.indexOf(')', open)
    return src.slice(open + 1, close)
  })()

  it('PROOF THE SLICE IS REAL before anything is asserted absent from it', () => {
    // Beat 105's species: an absence check against an empty string passes for
    // every column ever named. The slice has to be shown to contain something
    // first, or the two assertions below are decoration.
    expect(columns.length).toBeGreaterThan(100)
    expect(columns.split(',').length).toBeGreaterThan(20)
  })

  it('symbol IS in the insert column list', () => {
    expect(columns).toContain('symbol')
  })

  it('catalyst_type is NOT, so an imported trade is born untagged', () => {
    expect(
      columns.includes('catalyst_type'),
      'The import now writes catalyst_type. Beat 140 measured that it did not, ' +
        'and the whole "the app cannot produce a free-text catalyst" finding ' +
        'rests on that. Re-run the catalyst recon before trusting it again.',
    ).toBe(false)
  })
})

// --- RC3 : THE SEEDED NAMES ARE PINNED --------------------------------------

/** A LITERAL, never derived from the array under test. Deriving it would assert
 *  that a list equals itself, which is true on every rename. */
const PINNED = [
  'Earnings',
  'FDA / Clinical',
  'News / PR',
  'Offering / Dilution',
  'Partnership / Contract',
  'M&A / Buyout',
  'Short Squeeze',
  'Uplisting',
  'Halt Resume',
  'AI News',
  'Crypto News',
  'Sympathy',
  'Continuation',
  'Technical / No Catalyst',
  'Other',
]

const SEED_DRIFT_HAZARD =
  'A SEEDED CATALYST NAME CHANGED. Do not just update this list. ' +
  'The seed is inserted ONLY into an empty catalyst_def table, so every ' +
  'existing user keeps the OLD name on their trades, and nothing propagates a ' +
  'seed rename onto trade rows -- the one path that rewrites them ' +
  '(catalyst/repo.ts renameCatalystDef) fires only on a USER rename. Every ' +
  'trade carrying the old string becomes an orphan: it still buckets in ' +
  'Analytics by its raw string, but it is invisible in Settings, and the ' +
  'orphan backfill cannot rescue it because that migration is gated at prior ' +
  'schema version forty-six. This has already happened twice and each time it ' +
  'took a hand-written migration. WRITE THE MIGRATION IN THIS SAME CHANGE.'

describe('RC3 the seeded catalyst vocabulary is pinned', () => {
  it('the fifteen names, in order, are exactly what shipped', () => {
    expect(CATALYST_SEED.map((s) => s.name), SEED_DRIFT_HAZARD).toEqual(PINNED)
  })

  it('and their sort positions are still zero to fourteen in order', () => {
    expect(CATALYST_SEED.map((s) => s.sort_position)).toEqual(
      PINNED.map((_, i) => i),
    )
  })
})

// --- RC4 : THE SEED CANNOT RE-RUN -------------------------------------------

/** This is what makes RC3 load-bearing. If the seed re-ran on a populated
 *  table, a rename would simply re-insert the new name and the drift would
 *  repair itself. It does not, so it will not. */
describe('RC4 the seed runs only into an empty table', () => {
  const src = read('electron', 'db', 'migrate-catalyst-vocabulary.ts')

  it('the count is taken from catalyst_def and gates the insert on zero', () => {
    expect(src).toContain("SELECT COUNT(*) AS n FROM catalyst_def")
    expect(
      src,
      'The seed-if-empty gate changed. RC3 pins the names on the assumption ' +
        'that an existing user is never re-seeded; if that is no longer true, ' +
        'the seed-drift hazard RC3 describes has a different shape.',
    ).toContain('if (n === 0) {')
  })
})

// THE REASON CONTRACT — a source-scanning backstop.
//
// The fail-safe (an unrecognised reason counts as a FAILURE) protects us at RUNTIME, via a
// console line nobody in a packaged app will ever read. That is not good enough for a rule whose
// violation leaks the in-progress marker forever. So it must fail LOUDLY, at build time.
//
// TWO LAYERS, and they cover different holes:
//
//   1. THE TYPE (src/core/db/migrationChain.ts). MigrationReason is DERIVED from the two runtime
//      arrays, and MigrationOutcome.reason is that closed union. A migration that invents
//      'foo-failed' cannot be passed to migrateAfterSchema's `record()` — the call stops
//      compiling until 'foo-failed' is added to HEALTHY_SKIP_REASONS or FAILURE_REASONS, which
//      forces the author to decide which it is. tsc is the gate.
//
//   2. THIS TEST. The type only bites if the migration is WIRED. It cannot see a migration that
//      declares a new reason and is never recorded at all — that one compiles clean, its failure
//      is invisible to the chain, and the marker clears as though it had succeeded. So this reads
//      the migration SOURCE, harvests every reason literal a migration verdict can carry, and
//      asserts each is classified; and it asserts every verdict-bearing migration the boot calls
//      is actually recorded.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HEALTHY_SKIP_REASONS,
  FAILURE_REASONS,
  isClassifiedReason,
  isMigrationOk,
} from '@/core/db/migrationChain'

const DB_DIR = dirname(dirname(fileURLToPath(import.meta.url))) // electron/db
const migrationFiles = readdirSync(DB_DIR).filter(
  (f) => f.startsWith('migrate-') && f.endsWith('.ts'),
)

/** An exported result interface that carries a migration VERDICT.
 *
 *  `ran:` is the discriminator. It deliberately excludes migrate-content-hash's
 *  BlobToContentHashResult, whose 'malformed-json' / 'not-an-array' / 'empty-fills' /
 *  'no-valid-fills' are PER-ROW outcomes of a hashing helper — never a migration's verdict —
 *  and which has no `ran` field. `status:` catches the one outlier, TradesRebuildResult. */
function verdictInterfaces(src: string): string[] {
  const out: string[] = []
  const re = /export interface (\w+)\s*\{([\s\S]*?)\n\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const body = m[2]
    if (/^\s*ran\s*:/m.test(body) || /^\s*status\s*:/m.test(body)) out.push(body)
  }
  return out
}

const reasonLiterals = (body: string): string[] => {
  const m = /reason\??:\s*((?:\s*\|?\s*'[a-z-]+')+)/.exec(body)
  if (!m) return []
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1])
}

const statusLiterals = (body: string): string[] => {
  const m = /status\s*:\s*((?:\s*\|?\s*'[a-z-]+')+)/.exec(body)
  if (!m) return []
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1])
}

describe('the reason universe is CLOSED', () => {
  it('found the migration files at all (a scan that finds nothing must not pass silently)', () => {
    expect(migrationFiles.length).toBeGreaterThan(20)
  })

  it('*** every reason literal a migration verdict can carry is CLASSIFIED ***', () => {
    const unclassified: string[] = []
    for (const f of migrationFiles) {
      const src = readFileSync(join(DB_DIR, f), 'utf8')
      for (const body of verdictInterfaces(src)) {
        for (const reason of reasonLiterals(body)) {
          if (!isClassifiedReason(reason)) unclassified.push(`${f}: '${reason}'`)
        }
      }
    }
    // If this fires you added a migration reason and did not decide what it MEANS. Put it in
    // HEALTHY_SKIP_REASONS (a legitimate skip) or FAILURE_REASONS (keep the marker, retry next
    // launch). Leaving it out makes the marker leak forever and every boot re-run the chain.
    expect(unclassified).toEqual([])
  })

  it("trades-rebuild's 'aborted' status is classified (it has NO `ran` field — the outlier)", () => {
    const src = readFileSync(join(DB_DIR, 'migrate-trades-rebuild-dedup.ts'), 'utf8')
    const statuses = verdictInterfaces(src).flatMap(statusLiterals)
    expect(statuses).toContain('aborted')
    expect(isClassifiedReason('aborted')).toBe(true)
    expect(isMigrationOk({ ran: false, reason: 'aborted' })).toBe(false)
  })

  it('the two arrays are DISJOINT — no reason may be both healthy and a failure', () => {
    const both = (HEALTHY_SKIP_REASONS as readonly string[]).filter((r) =>
      (FAILURE_REASONS as readonly string[]).includes(r),
    )
    expect(both).toEqual([])
  })

  it('every reason in EITHER array classifies, and lands on the side it was filed under', () => {
    for (const r of HEALTHY_SKIP_REASONS) {
      expect(isClassifiedReason(r)).toBe(true)
      expect(isMigrationOk({ ran: false, reason: r })).toBe(true)
    }
    for (const r of FAILURE_REASONS) {
      expect(isClassifiedReason(r)).toBe(true)
      expect(isMigrationOk({ ran: false, reason: r })).toBe(false)
    }
  })
})

describe('every verdict-bearing migration the boot calls is actually RECORDED', () => {
  it('*** a migration whose failure nobody collects clears the marker as if it had succeeded ***', () => {
    const dbSrc = readFileSync(join(DB_DIR, 'database.ts'), 'utf8')

    // Which migrate-*.ts modules report a verdict AND are called during boot?
    const verdictBearing = migrationFiles.filter((f) => {
      const src = readFileSync(join(DB_DIR, f), 'utf8')
      if (verdictInterfaces(src).length === 0) return false
      const fn = /export function (migrate\w+)/.exec(src)?.[1]
      return fn != null && new RegExp(`\\b${fn}\\s*\\(`).test(dbSrc)
    })

    const recordCalls = (dbSrc.match(/^\s*record\(/gm) ?? []).length

    // If these diverge, someone added a verdict-bearing migration to the chain and did not
    // record() its result — so a soft failure in it would be invisible, the chain would report
    // success, the marker would clear, and that migration would be dead forever. Which is,
    // precisely and exactly, the bug this whole commit exists to kill.
    expect(recordCalls).toBe(verdictBearing.length)
  })
})

// Beat 2 PART A — the "No Setup" system row is FULLY FROZEN: deletePlaybook and
// updatePlaybook (which is the one fn behind rename + re-grade + archive) must
// refuse any is_system=1 row. Same harness constraint as the other electron
// tests: better-sqlite3's native binary won't load under vitest (ERR_DLOPEN —
// Electron ABI), so we drive a capturing + programmable mock Database — assert
// the SQL issued (or NOT issued) and that the guard throws. Real enforcement is
// sandbox-verified against a copy.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let prepared: string[]
let runs: Array<{ sql: string; args: unknown[] }>
let respond: (sql: string, args: unknown[]) => unknown

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      get: (...a: unknown[]) => { prepared.push(q); return respond(q, a) },
      all: () => { prepared.push(q); return [] },
      run: (...a: unknown[]) => { prepared.push(q); runs.push({ sql: q, args: a }); return { changes: 1, lastInsertRowid: 1 } },
    }
  },
  exec(sql: string) { prepared.push(norm(sql)) },
  transaction: (fn: any) => (...a: any[]) => fn(...a),
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import { deletePlaybook, updatePlaybook } from '../repo'

const PLAYBOOK_ROW = {
  id: 7, name: 'Bull Flag', description: '', rules: '', ideal_conditions: '',
  archived: 0, tier: 'A', created_at: '2026-01-01',
}

// Responder factory: the is_system guard SELECT returns the given flag; every
// other playbook-row read returns a normal row (or undefined for not-found).
function withSystem(is_system: number | null) {
  return (q: string): unknown => {
    if (/^SELECT is_system FROM playbooks WHERE id/i.test(q)) {
      return is_system === null ? undefined : { is_system }
    }
    if (/^SELECT 1 FROM playbooks WHERE id/i.test(q)) {
      return is_system === null ? undefined : { '1': 1 }
    }
    if (/FROM playbooks WHERE id/i.test(q)) {
      return is_system === null ? undefined : PLAYBOOK_ROW
    }
    return undefined
  }
}

const mutationSql = (q: string) =>
  /DELETE FROM playbooks/i.test(q) ||
  /UPDATE playbooks SET/i.test(q) ||
  /UPDATE trades SET playbook_id = NULL/i.test(q)

beforeEach(() => { prepared = []; runs = []; respond = () => undefined })

describe('deletePlaybook — system-row guard', () => {
  it('throws on an is_system=1 row and issues NO delete/UPDATE SQL', () => {
    respond = withSystem(1)
    expect(() => deletePlaybook(108)).toThrow(/system playbook/i)
    expect(prepared.some(mutationSql)).toBe(false)
  })

  it('deletes a non-system row exactly as today (nulls primary, then deletes)', () => {
    respond = withSystem(0)
    try { deletePlaybook(7) } catch { /* SQL contract only */ }
    expect(runs.some((r) => /UPDATE trades SET playbook_id = NULL WHERE playbook_id/i.test(r.sql))).toBe(true)
    expect(runs.some((r) => /DELETE FROM playbooks WHERE id/i.test(r.sql))).toBe(true)
  })

  it('preserves not-found behavior (no throw, no mutation) for a missing id', () => {
    respond = withSystem(null)
    expect(() => deletePlaybook(999)).not.toThrow()
    expect(prepared.some(mutationSql)).toBe(false)
  })
})

describe('updatePlaybook — system-row guard (one fn behind rename, re-grade, archive)', () => {
  for (const [label, patch] of [
    ['rename', { id: 108, name: 'Renamed' }],
    ['re-grade', { id: 108, tier: 'A+' }],
    ['archive', { id: 108, archived: true }],
  ] as const) {
    it(`throws on an is_system=1 row (${label}) and issues NO UPDATE SQL`, () => {
      respond = withSystem(1)
      expect(() => updatePlaybook(patch as never)).toThrow(/system playbook/i)
      expect(prepared.some((q) => /UPDATE playbooks SET/i.test(q))).toBe(false)
    })
  }

  it('updates a non-system row exactly as today', () => {
    respond = withSystem(0)
    try { updatePlaybook({ id: 7, name: 'New Name' }) } catch { /* SQL contract only */ }
    expect(runs.some((r) => /UPDATE playbooks SET/i.test(r.sql))).toBe(true)
  })
})

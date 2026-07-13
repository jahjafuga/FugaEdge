// bootOrFail — the guard that turns a fatal openDatabase() throw into a VISIBLE failure.
//
// THE REGRESSION THIS FILE EXISTS FOR: openDatabase() is called inside
// app.whenReady().then(...) (electron/main/index.ts). It is ALLOWED to throw — the rule-breaks
// pre-migration backup propagates a failed copy on purpose, so a machine that cannot be
// backed up never advances its schema. Un-guarded, that throw is an unhandled promise
// rejection: the process dies with NO window and NO dialog. The user sees the app simply not
// open. That trades a silent data failure for a silent startup failure, which is not a trade.
//
// main/index.ts itself is not importable under vitest (it calls app.setPath and
// app.whenReady() at module load, and transitively pulls in Electron-ABI better-sqlite3), so
// the guard is extracted here with its Electron APIs INJECTED. This tests the sequencing that
// actually matters: dialog shown, process exited, rest of startup never reached.

import { describe, expect, it, vi } from 'vitest'
import { bootOrFail, type BootFailureDeps } from '../startup'
import { backupFailedError } from '@/core/startup/bootFailure'
import type { BootFailureDialog } from '@/core/startup/bootFailure'

function spyDeps(overrides: Partial<BootFailureDeps> = {}) {
  const shown: BootFailureDialog[] = []
  const exited: number[] = []
  const logged: string[] = []
  const deps: BootFailureDeps = {
    showDialog: (d) => shown.push(d),
    exit: (c) => exited.push(c),
    logError: (m) => logged.push(m),
    ...overrides,
  }
  return { deps, shown, exited, logged }
}

describe('bootOrFail — the happy path', () => {
  it('runs boot, returns true, and shows nothing', () => {
    const { deps, shown, exited } = spyDeps()
    const boot = vi.fn()
    expect(bootOrFail(boot, deps)).toBe(true)
    expect(boot).toHaveBeenCalledTimes(1)
    expect(shown).toEqual([])
    expect(exited).toEqual([])
  })
})

describe('bootOrFail — a fatal throw', () => {
  it('does NOT rethrow — the unhandled rejection is the bug being fixed', () => {
    const { deps } = spyDeps()
    expect(() =>
      bootOrFail(() => {
        throw backupFailedError('/x/y.bak', new Error('ENOSPC'))
      }, deps),
    ).not.toThrow()
  })

  it('shows a dialog, exits non-zero, and reports false so startup bails', () => {
    const { deps, shown, exited } = spyDeps()
    const ok = bootOrFail(() => {
      throw backupFailedError('/x/y.bak', new Error('ENOSPC'))
    }, deps)
    expect(ok).toBe(false)
    expect(shown).toHaveLength(1)
    expect(exited).toEqual([1])
  })

  it('shows the dialog BEFORE it exits — an exit-first order shows the user nothing', () => {
    const order: string[] = []
    const { deps } = spyDeps({
      showDialog: () => order.push('dialog'),
      exit: () => order.push('exit'),
    })
    bootOrFail(() => {
      throw new Error('boom')
    }, deps)
    expect(order).toEqual(['dialog', 'exit'])
  })

  it('exits EVEN IF the dialog itself fails — never fall through into a half-booted app', () => {
    const { deps, exited, logged } = spyDeps({
      showDialog: () => {
        throw new Error('no display')
      },
    })
    const ok = bootOrFail(() => {
      throw new Error('boom')
    }, deps)
    expect(ok).toBe(false)
    expect(exited).toEqual([1])
    expect(logged.join('\n')).toContain('no display')
  })

  it('logs the failure for the console/log file as well as the dialog', () => {
    const { deps, logged } = spyDeps()
    bootOrFail(() => {
      throw new Error('ENOSPC: no space left on device')
    }, deps)
    expect(logged.join('\n')).toContain('ENOSPC')
  })
})

describe('bootOrFail — the dialog copy follows the ERROR, not the call site', () => {
  it('a BACKUP failure promises the journal is unchanged', () => {
    const { deps, shown } = spyDeps()
    bootOrFail(() => {
      throw backupFailedError('/x/y.bak', new Error('ENOSPC'))
    }, deps)
    expect(shown[0].detail).toMatch(/has not been changed/i)
  })

  it('ANY OTHER failure does not — the same guard must not make a promise it cannot keep', () => {
    const { deps, shown } = spyDeps()
    bootOrFail(() => {
      throw new Error('SQLITE_CORRUPT: database disk image is malformed')
    }, deps)
    expect(shown[0].detail).not.toMatch(/has not been changed/i)
    expect(shown[0].detail).toContain('SQLITE_CORRUPT')
  })
})

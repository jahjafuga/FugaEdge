// v0.2.3 P2b — IPC handler contract for the six soft-delete lifecycle channels
// + the listTrades {deleted} threading. better-sqlite3 won't load under vitest,
// so we mock the db, the lifecycle module (spies), fs, the attachments dir, and
// the cache bump. We capture ipcMain.handle registrations into a map and invoke
// the handlers directly, asserting: correct lifecycle fn + args, withVersionBump
// applied (bumpDataVersion fired), and hard-delete's fail-soft fs cleanup
// (per-file rm then per-trade dir rm; rejections swallowed).

import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'
import { join } from 'node:path'

const ATTROOT = join('/tmp', 'attroot')

const { handlers, lifecycle, rmSpy, bumpSpy, listSpy } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
  lifecycle: {
    softDeleteTrade: vi.fn(),
    softDeleteTrades: vi.fn(),
    restoreTrade: vi.fn(),
    restoreTrades: vi.fn(),
    hardDeleteTrade: vi.fn(() => ({ deletedAttachmentPaths: [] as string[] })),
    hardDeleteTrades: vi.fn(() => ({ deletedAttachmentPaths: [] as string[] })),
  },
  rmSpy: vi.fn(async () => {}),
  bumpSpy: vi.fn(),
  listSpy: vi.fn(() => [] as unknown[]),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))
// Prevent better-sqlite3 from loading via the real repo modules that ipc.ts
// imports at module top (notes, timeframe, …) — they only need openDatabase.
vi.mock('../../db/database', () => ({ openDatabase: () => ({}) }))
vi.mock('../../lib/cache', () => ({ bumpDataVersion: bumpSpy }))
vi.mock('../../attachments/dir', () => ({ getAttachmentsDir: () => ATTROOT }))
vi.mock('node:fs/promises', () => ({ rm: rmSpy }))
vi.mock('../lifecycle', () => lifecycle)
vi.mock('../list', () => ({ listTrades: listSpy }))

import { registerTradesIpc } from '../ipc'
import { IPC } from '@shared/ipc-channels'

const invoke = (ch: string, input?: unknown) => handlers.get(ch)!({}, input)

beforeAll(() => {
  registerTradesIpc()
})

beforeEach(() => {
  vi.clearAllMocks()
  lifecycle.hardDeleteTrade.mockReturnValue({ deletedAttachmentPaths: [] })
  lifecycle.hardDeleteTrades.mockReturnValue({ deletedAttachmentPaths: [] })
  rmSpy.mockResolvedValue(undefined)
})

describe('soft-delete / restore channels', () => {
  it('TRADE_SOFT_DELETE → softDeleteTrade(trade_id) + version bump', () => {
    invoke(IPC.TRADE_SOFT_DELETE, { trade_id: 7 })
    expect(lifecycle.softDeleteTrade).toHaveBeenCalledWith(7)
    expect(bumpSpy).toHaveBeenCalledTimes(1)
  })

  it('TRADES_SOFT_DELETE_BULK → softDeleteTrades(trade_ids) + version bump', () => {
    invoke(IPC.TRADES_SOFT_DELETE_BULK, { trade_ids: [7, 8] })
    expect(lifecycle.softDeleteTrades).toHaveBeenCalledWith([7, 8])
    expect(bumpSpy).toHaveBeenCalledTimes(1)
  })

  it('TRADE_RESTORE → restoreTrade(trade_id) + version bump', () => {
    invoke(IPC.TRADE_RESTORE, { trade_id: 9 })
    expect(lifecycle.restoreTrade).toHaveBeenCalledWith(9)
    expect(bumpSpy).toHaveBeenCalledTimes(1)
  })

  it('TRADES_RESTORE_BULK → restoreTrades(trade_ids) + version bump', () => {
    invoke(IPC.TRADES_RESTORE_BULK, { trade_ids: [9, 10] })
    expect(lifecycle.restoreTrades).toHaveBeenCalledWith([9, 10])
    expect(bumpSpy).toHaveBeenCalledTimes(1)
  })
})

describe('hard-delete channels — DB delete then fail-soft disk cleanup', () => {
  it('TRADE_HARD_DELETE: calls hardDeleteTrade, rm each file, then rm the trade dir', async () => {
    lifecycle.hardDeleteTrade.mockReturnValue({
      deletedAttachmentPaths: ['7/a.png', '7/b.png'],
    })
    await invoke(IPC.TRADE_HARD_DELETE, { trade_id: 7 })

    expect(lifecycle.hardDeleteTrade).toHaveBeenCalledWith(7)
    expect(bumpSpy).toHaveBeenCalledTimes(1)

    const calls = rmSpy.mock.calls
    expect(calls).toHaveLength(3) // 2 files + 1 dir
    expect(calls[0]).toEqual([join(ATTROOT, '7/a.png'), { force: true }])
    expect(calls[1]).toEqual([join(ATTROOT, '7/b.png'), { force: true }])
    // dir rm comes AFTER the per-file rms, exactly once, recursive+force.
    expect(calls[2]).toEqual([join(ATTROOT, '7'), { recursive: true, force: true }])
  })

  it('TRADE_HARD_DELETE with no attachments: still rm the (possibly missing) dir once', async () => {
    lifecycle.hardDeleteTrade.mockReturnValue({ deletedAttachmentPaths: [] })
    await invoke(IPC.TRADE_HARD_DELETE, { trade_id: 7 })
    expect(rmSpy.mock.calls).toEqual([
      [join(ATTROOT, '7'), { recursive: true, force: true }],
    ])
  })

  it('TRADES_HARD_DELETE_BULK: rm files then a dir per trade_id', async () => {
    lifecycle.hardDeleteTrades.mockReturnValue({
      deletedAttachmentPaths: ['7/a.png', '8/c.png'],
    })
    await invoke(IPC.TRADES_HARD_DELETE_BULK, { trade_ids: [7, 8] })

    expect(lifecycle.hardDeleteTrades).toHaveBeenCalledWith([7, 8])
    const calls = rmSpy.mock.calls
    expect(calls[0]).toEqual([join(ATTROOT, '7/a.png'), { force: true }])
    expect(calls[1]).toEqual([join(ATTROOT, '8/c.png'), { force: true }])
    expect(calls[2]).toEqual([join(ATTROOT, '7'), { recursive: true, force: true }])
    expect(calls[3]).toEqual([join(ATTROOT, '8'), { recursive: true, force: true }])
  })

  it('is fail-soft: an rm rejection is swallowed, the handler still resolves', async () => {
    lifecycle.hardDeleteTrade.mockReturnValue({
      deletedAttachmentPaths: ['7/a.png'],
    })
    rmSpy.mockRejectedValueOnce(new Error('EBUSY'))
    // Must not throw — disk is not the source of truth; DB delete already committed.
    await expect(
      handlers.get(IPC.TRADE_HARD_DELETE)!({}, { trade_id: 7 }),
    ).resolves.toBeUndefined()
    // Cleanup continued past the failed file rm to the dir rm.
    expect(rmSpy.mock.calls.at(-1)).toEqual([
      join(ATTROOT, '7'),
      { recursive: true, force: true },
    ])
  })
})

describe('TRADES_LIST {deleted} threading', () => {
  it('passes the {deleted:true} option straight to listTrades', () => {
    invoke(IPC.TRADES_LIST, { deleted: true })
    expect(listSpy).toHaveBeenCalledWith({ deleted: true })
  })

  it('defaults to {} when no opts are given', () => {
    invoke(IPC.TRADES_LIST, undefined)
    expect(listSpy).toHaveBeenCalledWith({})
  })
})

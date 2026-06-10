// v0.2.4 §F1 — IPC handler contract for trade:get (TRADE_GET). Mirrors the
// lifecycle-ipc.test.ts shim pattern: better-sqlite3 won't load under vitest,
// so we mock the db + the modules registerTradesIpc pulls in, capture
// ipcMain.handle registrations into a map, and invoke the captured handler
// directly. We assert the handler delegates to getTrade(input.trade_id) and
// passes the result (row or null) straight through — no error transformation.
//
// getTrade's own SQL contract (no deleted_at filter, etc.) is covered in
// electron/db/__tests__/read-paths-deleted-filter.test.ts; here we pin only the
// IPC wiring.

import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'

const { handlers, getTradeSpy } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
  getTradeSpy: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))
// registerTradesIpc transitively imports repo modules that touch openDatabase;
// stub it so nothing loads the native better-sqlite3 binary.
vi.mock('../../db/database', () => ({ openDatabase: () => ({}) }))
vi.mock('../../lib/cache', () => ({ bumpDataVersion: vi.fn() }))
vi.mock('../../attachments/dir', () => ({ getAttachmentsDir: () => '/tmp/attroot' }))
vi.mock('node:fs/promises', () => ({ rm: vi.fn(async () => {}) }))
vi.mock('../lifecycle', () => ({
  softDeleteTrade: vi.fn(),
  softDeleteTrades: vi.fn(),
  restoreTrade: vi.fn(),
  restoreTrades: vi.fn(),
  hardDeleteTrade: vi.fn(() => ({ deletedAttachmentPaths: [] })),
  hardDeleteTrades: vi.fn(() => ({ deletedAttachmentPaths: [] })),
}))
// The handler under test delegates to getTrade; mock ../list so no real SQL runs.
vi.mock('../list', () => ({ listTrades: vi.fn(), getTrade: getTradeSpy }))

import { registerTradesIpc } from '../ipc'
import { IPC } from '@shared/ipc-channels'

const invoke = (ch: string, input?: unknown) => handlers.get(ch)!({}, input)

// Minimal stand-in — the handler is pure pass-through, so identity is all we assert.
const sampleTrade = { id: 7, symbol: 'AAPL' } as unknown as TradeListRow

beforeAll(() => {
  registerTradesIpc()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trade:get IPC handler', () => {
  it('delegates to getTrade(input.trade_id) and returns the row', () => {
    getTradeSpy.mockReturnValue(sampleTrade)
    const result = invoke(IPC.TRADE_GET, { trade_id: 7 })
    expect(getTradeSpy).toHaveBeenCalledTimes(1)
    expect(getTradeSpy).toHaveBeenCalledWith(7)
    expect(result).toBe(sampleTrade)
  })

  it('passes through null when getTrade finds no row', () => {
    getTradeSpy.mockReturnValue(null)
    const result = invoke(IPC.TRADE_GET, { trade_id: 999 })
    expect(getTradeSpy).toHaveBeenCalledWith(999)
    expect(result).toBeNull()
  })
})

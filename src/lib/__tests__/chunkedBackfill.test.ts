import { describe, it, expect, vi } from 'vitest'
import { runChunkedBackfill } from '@/lib/chunkedBackfill'

describe('runChunkedBackfill', () => {
  // (a)
  it('returns zero counts for empty items', async () => {
    const result = await runChunkedBackfill({
      items: [],
      processItem: async () => {},
    })
    expect(result.processed).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  // (b)
  it('processes every item via processItem callback in order', async () => {
    const processItem = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({ items: [1, 2, 3], processItem })
    expect(processItem).toHaveBeenCalledTimes(3)
    expect(processItem).toHaveBeenNthCalledWith(1, 1)
    expect(processItem).toHaveBeenNthCalledWith(2, 2)
    expect(processItem).toHaveBeenNthCalledWith(3, 3)
  })

  // (c)
  it('does not yield when items fit in a single chunk', async () => {
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: [1, 2, 3, 4, 5],
      chunkSize: 50,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).not.toHaveBeenCalled()
  })

  // (d)
  it('does not yield at chunk boundary that aligns with end of items', async () => {
    // [1,2] [3,4] — yield once between, NOT after the last chunk.
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: [1, 2, 3, 4],
      chunkSize: 2,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  // (e)
  it('yields N-1 times for N chunks (uneven final chunk)', async () => {
    // [1,2] [3,4] [5,6] [7] — yield after items 2, 4, and 6 only.
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: [1, 2, 3, 4, 5, 6, 7],
      chunkSize: 2,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(3)
  })

  // (f)
  it('catches errors in processItem, counts them, and continues', async () => {
    const processItem = vi.fn(async (item: number) => {
      if (item === 2) throw new Error('boom')
    })
    const onError = vi.fn()
    const result = await runChunkedBackfill({
      items: [1, 2, 3],
      processItem,
      onError,
    })
    expect(result.processed).toBe(2)
    expect(result.errors).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 2)
    expect(processItem).toHaveBeenCalledTimes(3)
  })

  // (g)
  it('emits onProgress with 1-indexed current and total after each item', async () => {
    const calls: Array<{ current: number; total: number; item: number }> = []
    await runChunkedBackfill({
      items: [10, 20, 30],
      processItem: async () => {},
      onProgress: (p) => calls.push(p),
    })
    expect(calls).toEqual([
      { current: 1, total: 3, item: 10 },
      { current: 2, total: 3, item: 20 },
      { current: 3, total: 3, item: 30 },
    ])
  })

  // (h)
  it('emits onProgress for items that errored, in the same shape', async () => {
    const currents: number[] = []
    await runChunkedBackfill({
      items: [1, 2],
      processItem: async (item: number) => {
        if (item === 1) throw new Error('fail')
      },
      onProgress: (p) => currents.push(p.current),
    })
    expect(currents).toEqual([1, 2])
  })

  // (i)
  it('defaults chunkSize to 50 when not provided', async () => {
    // 100 items / 50 chunk = 2 chunks → 1 yield.
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: Array.from({ length: 100 }, (_, i) => i),
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  // (j) — invalid chunkSize falls back to default 50 (1 yield over 100 items).
  it('falls back to default chunkSize for chunkSize 0', async () => {
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: Array.from({ length: 100 }, (_, i) => i),
      chunkSize: 0,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  it('falls back to default chunkSize for negative chunkSize -5', async () => {
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: Array.from({ length: 100 }, (_, i) => i),
      chunkSize: -5,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  it('falls back to default chunkSize for non-integer chunkSize 1.5', async () => {
    const yieldBetweenChunks = vi.fn().mockResolvedValue(undefined)
    await runChunkedBackfill({
      items: Array.from({ length: 100 }, (_, i) => i),
      chunkSize: 1.5,
      processItem: async () => {},
      yieldBetweenChunks,
    })
    expect(yieldBetweenChunks).toHaveBeenCalledTimes(1)
  })

  // (k)
  it('returns durationMs as a non-negative number', async () => {
    const result = await runChunkedBackfill({
      items: [1, 2, 3],
      processItem: async () => {},
    })
    expect(Number.isFinite(result.durationMs)).toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})

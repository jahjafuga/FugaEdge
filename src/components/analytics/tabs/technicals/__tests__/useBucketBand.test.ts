// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBucketBand } from '../useBucketBand'

// Direct unit tests for the extracted state-machine hook (F3 phase 3/3). The
// c31e5e1 characterization tests cover the hook indirectly through
// MacdStateGrid; these exercise its raw API — including isBucketOpen /
// isBucketDisplayed and the closeMs injection, which MacdStateGrid never
// touches. renderHook + act drives the hook in isolation; same fake-timer
// pattern as Beat 1, no userEvent/fireEvent.
//
// This is a .test.ts (no JSX) but renderHook needs a DOM, so the docblock above
// opts this file into jsdom (the config routes only *.test.tsx there by glob).
//
// Keys are arbitrary string-literal unions, NOT the MACD BucketKey — that
// decoupling is the whole point of the <TBucketKey extends string> generic.

type Key = 'a' | 'b' | 'c'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Fire pending fake timers and flush the resulting hook state updates. The
// timer callbacks are synchronous setState, so a sync act() suffices.
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useBucketBand — state machine (direct unit tests)', () => {
  it('initial state: nothing open or displayed', () => {
    const { result } = renderHook(() => useBucketBand<Key>())
    expect(result.current.openBucket).toBeNull()
    expect(result.current.displayBucket).toBeNull()
    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(false)
  })

  it('open from clean: toggling opens and displays immediately', () => {
    const { result } = renderHook(() => useBucketBand<Key>())
    act(() => result.current.onToggle('a'))

    expect(result.current.openBucket).toBe('a')
    expect(result.current.displayBucket).toBe('a')
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketOpen('b')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(true)
    expect(result.current.isBucketDisplayed('b')).toBe(false)
  })

  it('close by re-toggle: display lags open by 210ms (209→210 boundary)', () => {
    const { result } = renderHook(() => useBucketBand<Key>())
    act(() => result.current.onToggle('a')) // open
    act(() => result.current.onToggle('a')) // re-toggle → start close

    // Immediately: closed, but still displayed (the lag).
    expect(result.current.openBucket).toBeNull()
    expect(result.current.displayBucket).toBe('a')
    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(true)

    advance(209)
    expect(result.current.openBucket).toBeNull()
    expect(result.current.displayBucket).toBe('a')

    advance(1)
    expect(result.current.displayBucket).toBeNull()
  })

  it('sequential switch: neither bucket open during the 210ms transit', () => {
    const { result } = renderHook(() => useBucketBand<Key>())
    act(() => result.current.onToggle('a')) // open a
    act(() => result.current.onToggle('b')) // switch to b

    // Immediately: a collapsed, b not yet open — NEITHER open, a still displayed.
    expect(result.current.openBucket).toBeNull()
    expect(result.current.displayBucket).toBe('a')
    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketOpen('b')).toBe(false)

    advance(209)
    expect(result.current.openBucket).toBeNull()
    expect(result.current.displayBucket).toBe('a')

    advance(1)
    expect(result.current.openBucket).toBe('b')
    expect(result.current.displayBucket).toBe('b')
  })

  it('mid-transit re-toggle: cancels the pending close and reopens', () => {
    const { result } = renderHook(() => useBucketBand<Key>())
    act(() => result.current.onToggle('a')) // open
    act(() => result.current.onToggle('a')) // start close (210ms pending)
    advance(50) // 50ms into the close
    act(() => result.current.onToggle('a')) // re-toggle → cancel + reopen

    expect(result.current.openBucket).toBe('a')
    expect(result.current.displayBucket).toBe('a')

    advance(1000) // well past the original deadline — the cancelled timer never fires
    expect(result.current.openBucket).toBe('a')
    expect(result.current.displayBucket).toBe('a')
  })

  it('custom closeMs: the injected value drives the close lag', () => {
    const { result } = renderHook(() => useBucketBand<Key>({ closeMs: 50 }))
    act(() => result.current.onToggle('a')) // open
    act(() => result.current.onToggle('a')) // close (50ms pending)

    advance(49)
    expect(result.current.displayBucket).toBe('a')

    advance(1)
    expect(result.current.displayBucket).toBeNull()
  })

  it('generic parameter: operates over any string-literal union', () => {
    const h1 = renderHook(() => useBucketBand<'x' | 'y'>())
    act(() => h1.result.current.onToggle('x'))
    expect(h1.result.current.openBucket).toBe('x')

    const h2 = renderHook(() => useBucketBand<'foo' | 'bar' | 'baz'>())
    act(() => h2.result.current.onToggle('bar'))
    expect(h2.result.current.openBucket).toBe('bar')

    const h3 = renderHook(() => useBucketBand<'top' | 'middle' | 'bottom'>())
    act(() => h3.result.current.onToggle('bottom'))
    expect(h3.result.current.openBucket).toBe('bottom')
  })

  it('unmount clears the pending close timer', () => {
    // React 18.3 removed the "setState on an unmounted component" warning, so a
    // console.error assertion would be vacuous. Instead, positively verify the
    // cleanup ran: a pending close timer must be clearTimeout'd on unmount.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useBucketBand<Key>())
    act(() => result.current.onToggle('a')) // open (no timer set)
    act(() => result.current.onToggle('a')) // close → pending timer
    advance(50)

    const before = clearSpy.mock.calls.length
    unmount()
    expect(clearSpy.mock.calls.length).toBeGreaterThan(before)
  })
})

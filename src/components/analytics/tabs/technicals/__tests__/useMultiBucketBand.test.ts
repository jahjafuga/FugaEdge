// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMultiBucketBand } from '../useMultiBucketBand'

// Direct unit tests for the MULTI-open sibling of useBucketBand. Same fake-timer pattern and
// the same 209->210 boundary discipline as useBucketBand.test.ts.
//
// The reason this hook exists as its own module rather than inline in TierPerformanceCard is
// the PER-KEY timer map, and that is what most of this file is about: with several panels open,
// one collapsing panel must unmount ONLY its own content, on its OWN deadline. A single shared
// timer -- which is all useBucketBand needs, because only one panel can ever be closing there --
// would take the wrong key with it. The staggered-close test below is the one that would catch
// that, and it is the reason this is not a component-only concern.
//
// This is a .test.ts (no JSX) but renderHook needs a DOM, so the docblock opts it into jsdom.

type Key = 'a' | 'b' | 'c'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useMultiBucketBand — state machine', () => {
  it('initial state: nothing open or displayed', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    expect(result.current.openBuckets.size).toBe(0)
    expect(result.current.displayedBuckets.size).toBe(0)
    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(false)
  })

  it('open from clean: opens and displays immediately (no collapse-then-open dance)', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketDisplayed('a')).toBe(true)
  })

  it('*** MULTI: opening a second bucket does NOT close the first ***', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('b'))

    // useBucketBand would have collapsed 'a' here and opened 'b' only after closeMs.
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketOpen('b')).toBe(true)
    expect(result.current.openBuckets.size).toBe(2)

    advance(500)
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketOpen('b')).toBe(true)
  })

  it('three open at once', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('b'))
    act(() => result.current.onToggle('c'))
    expect(result.current.openBuckets.size).toBe(3)
    expect(result.current.displayedBuckets.size).toBe(3)
  })

  it('*** closing one bucket leaves the others open AND mounted ***', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('b'))
    act(() => result.current.onToggle('a')) // close 'a' only

    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(true) // still animating out
    expect(result.current.isBucketOpen('b')).toBe(true)
    expect(result.current.isBucketDisplayed('b')).toBe(true)

    advance(210)
    expect(result.current.isBucketDisplayed('a')).toBe(false) // 'a' unmounted
    expect(result.current.isBucketOpen('b')).toBe(true) // 'b' UNTOUCHED
    expect(result.current.isBucketDisplayed('b')).toBe(true)
  })

  it('close lag: display trails open by 210ms (209->210 boundary)', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('a'))

    expect(result.current.isBucketOpen('a')).toBe(false)
    expect(result.current.isBucketDisplayed('a')).toBe(true)

    advance(209)
    expect(result.current.isBucketDisplayed('a')).toBe(true)

    advance(1)
    expect(result.current.isBucketDisplayed('a')).toBe(false)
  })

  it('*** PER-KEY DEADLINES: staggered closes unmount independently ***', () => {
    // THE test for the timer Map. Close 'a' at t=0 and 'b' at t=100. If one shared timer drove
    // the unmount, 'b' would either die early with 'a' or keep 'a' alive. Each must land on its
    // own 210ms deadline.
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('b'))

    act(() => result.current.onToggle('a')) // start a's close at t=0
    advance(100)
    act(() => result.current.onToggle('b')) // start b's close at t=100

    advance(109) // t=209 — a is 209ms in, b is 109ms in. NEITHER has expired.
    expect(result.current.isBucketDisplayed('a')).toBe(true)
    expect(result.current.isBucketDisplayed('b')).toBe(true)

    advance(1) // t=210 — a's deadline lands. b's must NOT.
    expect(result.current.isBucketDisplayed('a')).toBe(false)
    expect(result.current.isBucketDisplayed('b')).toBe(true)

    advance(99) // t=309 — b is 209ms in.
    expect(result.current.isBucketDisplayed('b')).toBe(true)

    advance(1) // t=310 — b's own deadline lands.
    expect(result.current.isBucketDisplayed('b')).toBe(false)
  })

  it('mid-collapse re-toggle: cancels the pending close and reopens without unmounting', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('a')) // start close (210ms pending)
    advance(50)
    act(() => result.current.onToggle('a')) // re-toggle → cancel + reopen

    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketDisplayed('a')).toBe(true)

    advance(1000) // well past the original deadline — the cancelled timer never fires
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketDisplayed('a')).toBe(true)
  })

  it('a stale close timer cannot unmount a bucket that was reopened', () => {
    // The same hazard as above, but with a second bucket in play — the cancelled timer must not
    // reach across and strip 'a' out of displayedBuckets while 'b' churns.
    const { result } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('a')) // a closing
    advance(50)
    act(() => result.current.onToggle('a')) // a reopened
    act(() => result.current.onToggle('b')) // b opened

    advance(1000)
    expect(result.current.isBucketOpen('a')).toBe(true)
    expect(result.current.isBucketDisplayed('a')).toBe(true)
    expect(result.current.isBucketOpen('b')).toBe(true)
  })

  it('custom closeMs drives the lag', () => {
    const { result } = renderHook(() => useMultiBucketBand<Key>({ closeMs: 50 }))
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('a'))

    advance(49)
    expect(result.current.isBucketDisplayed('a')).toBe(true)
    advance(1)
    expect(result.current.isBucketDisplayed('a')).toBe(false)
  })

  it('generic parameter: operates over any string-literal union', () => {
    const h = renderHook(() => useMultiBucketBand<'A+' | 'A' | 'B' | 'C'>())
    act(() => h.result.current.onToggle('A+'))
    act(() => h.result.current.onToggle('B'))
    expect(h.result.current.isBucketOpen('A+')).toBe(true)
    expect(h.result.current.isBucketOpen('B')).toBe(true)
    expect(h.result.current.isBucketOpen('A')).toBe(false)
  })

  it('unmount clears EVERY pending close timer, not just one', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useMultiBucketBand<Key>())
    act(() => result.current.onToggle('a'))
    act(() => result.current.onToggle('b'))
    act(() => result.current.onToggle('a')) // a closing
    act(() => result.current.onToggle('b')) // b closing — TWO pending timers
    advance(50)

    const before = clearSpy.mock.calls.length
    unmount()
    // Both deadlines must be torn down. A single-timer cleanup would only clear one.
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(before + 2)
  })
})

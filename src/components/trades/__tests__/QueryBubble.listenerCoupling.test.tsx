// @vitest-environment jsdom
//
// v0.2.7 — THE SHORTCUT LISTENER'S COUPLING, CHARACTERIZED.
//
// WHAT THIS IS NOT. There is an unexplained intermittent failure in a
// neighbouring suite: Trades.queryBubble K1, "the shortcut did not open the
// bubble". It has been seen five times across two beats and has NOT reproduced
// in the last eighty-two solo runs at this commit -- pooled, three of one
// hundred and twelve. Two explanations for it have been measured and BOTH DIED:
// that full-suite load surfaces it, and that running solo surfaces it. No third
// is offered here.
//
// THIS FILE DOES NOT CLAIM TO FIX THAT RACE, and nothing in it should ever be
// read as evidence about it. What it documents is a separate, deterministic
// fact that happens to live at the same site, and that is assertable on every
// run rather than one in thirty.
//
// THE FACT. doOpen (QueryBubble.tsx:285-290) depends on `committed` for exactly
// one thing: writing it into a ref at :286. The keydown effect (:332-344)
// depends on doOpen. So a NEW `committed` object rebuilds doOpen, which tears
// the global Ctrl+K listener down and re-adds it -- a registration that turns
// over on a value the callback only ever stores.
//
// CH1 pins that this is what happens today. CH2 pins that an UNCHANGED
// `committed` does not cause it, which is the property beat 76's fix at
// Trades.tsx:132-141 exists to preserve upstream -- that fix stopped the PAGE
// from minting equal-content objects, and CH2 re-proves the component half of
// the same bargain from below.
//
// The pair has to be able to DISAGREE or it proves nothing, so both plants are
// on record: removing the dependency reddens CH1 alone, and re-registering on
// every render reddens CH2 alone.

import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QueryBubble from '@/components/trades/QueryBubble'
import { emptyFilters, type TradesFilterState } from '@/core/trades/tradesFilter'
import type { ResolverVocabulary } from '@/core/trades/queryResolver'

const VOCAB: ResolverVocabulary = {
  symbols: [],
  regions: [],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
}

type ListenerSpy = ReturnType<typeof vi.fn>
let addSpy: ListenerSpy
let removeSpy: ListenerSpy
let realAdd: typeof window.addEventListener
let realRemove: typeof window.removeEventListener

beforeEach(() => {
  // Wrapped rather than spyOn'd: spyOn's signature fights the DOM overloads,
  // and the listeners must still REALLY register or the component stops working
  // mid-test and the counts would describe a broken render.
  realAdd = window.addEventListener
  realRemove = window.removeEventListener
  addSpy = vi.fn()
  removeSpy = vi.fn()
  window.addEventListener = function (this: Window, ...args: unknown[]) {
    addSpy(...args)
    return (realAdd as (...a: unknown[]) => void).apply(this, args)
  } as typeof window.addEventListener
  window.removeEventListener = function (this: Window, ...args: unknown[]) {
    removeSpy(...args)
    return (realRemove as (...a: unknown[]) => void).apply(this, args)
  } as typeof window.removeEventListener
})

afterEach(() => {
  window.addEventListener = realAdd
  window.removeEventListener = realRemove
  cleanup()
})

/** Only the keydown registrations — the component owns several listener kinds
 *  (matchMedia change, a document mousedown, pointermove/pointerup) and counting
 *  them all would make this pass or fail for reasons that are not the subject. */
const keydownAdds = () => addSpy.mock.calls.filter((c) => c[0] === 'keydown').length
const keydownRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length

function mount(committed: TradesFilterState) {
  return render(
    <QueryBubble
      committed={committed}
      vocab={VOCAB}
      liveCount={0}
      onDraft={() => {}}
      onCommit={() => {}}
    />,
  )
}

// ─── CH1 ─────────────────────────────────────────────────────────────────────

describe('CH1 a NEW committed object churns the shortcut listener', () => {
  it('the keydown listener is removed once and re-added', () => {
    const { rerender } = mount(emptyFilters())
    const addsAfterMount = keydownAdds()
    expect(addsAfterMount, 'the shortcut was never registered at all').toBe(1)
    expect(keydownRemoves()).toBe(0)

    // A DIFFERENT object. Content is irrelevant — doOpen's dependency is the
    // reference, so a fresh object is enough to rebuild it.
    rerender(
      <QueryBubble
        committed={emptyFilters()}
        vocab={VOCAB}
        liveCount={0}
        onDraft={() => {}}
        onCommit={() => {}}
      />,
    )

    expect(
      keydownRemoves(),
      'the listener survived a new committed object — the coupling this file ' +
        'documents is gone, which is a CHANGE, not a pass',
    ).toBe(1)
    expect(keydownAdds()).toBe(2)
  })

  it('and it churns again on each further new object', () => {
    const { rerender } = mount(emptyFilters())
    for (let i = 0; i < 3; i++) {
      rerender(
        <QueryBubble
          committed={emptyFilters()}
          vocab={VOCAB}
          liveCount={0}
          onDraft={() => {}}
          onCommit={() => {}}
        />,
      )
    }
    // One registration at mount plus one per re-render; removes trail by one.
    expect(keydownAdds()).toBe(4)
    expect(keydownRemoves()).toBe(3)
  })
})

// ─── CH2 : THE COMPANION ─────────────────────────────────────────────────────

describe('CH2 the SAME committed object does not churn it', () => {
  // If this goes red without a plant, beat 76's fix is not holding and that is
  // a larger finding than anything else in this file.
  it('no remove, no second add', () => {
    const stable = emptyFilters()
    const { rerender } = mount(stable)
    expect(keydownAdds()).toBe(1)

    rerender(
      <QueryBubble
        committed={stable}
        vocab={VOCAB}
        liveCount={0}
        onDraft={() => {}}
        onCommit={() => {}}
      />,
    )

    expect(
      keydownRemoves(),
      'the listener re-registered on a render that changed nothing it depends on',
    ).toBe(0)
    expect(keydownAdds()).toBe(1)
  })

  it('and it still does not churn across several identical re-renders', () => {
    const stable = emptyFilters()
    const { rerender } = mount(stable)
    for (let i = 0; i < 3; i++) {
      rerender(
        <QueryBubble
          committed={stable}
          vocab={VOCAB}
          liveCount={0}
          onDraft={() => {}}
          onCommit={() => {}}
        />,
      )
    }
    expect(keydownAdds()).toBe(1)
    expect(keydownRemoves()).toBe(0)
  })
})

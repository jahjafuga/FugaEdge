// @vitest-environment jsdom
//
// CLAMP TO SHOW, NEVER TO STORE.
//
// The stored position is the trader's INTENT: it records where they put the
// disc. Only a drag may change it. Mount, resize and render clamp that intent
// into whatever viewport happens to be there right now, and write nothing.
//
// BEAT 276 GOT THIS HALF RIGHT AND HALF WRONG, and both halves are on record
// here. It added the missing re-clamp, which was correct -- the disc had been
// stranded past the right edge with nothing to scroll to. But it PERSISTED
// the clamped value, so narrowing rewrote the intent and widening again left
// the disc marooned mid-screen: measured on the founder's own frames, a 1432
// window clamped 1848 to 1360, and 1360 sits in the middle of a full-width
// screen. A clamp only ever pulls IN. If it may write, every narrow moment
// becomes permanent.
//
// BC1 AND BC2 ARE THE PAIR THAT SETTLES IT, and they are 276's BA1 and BA2
// rewritten rather than dropped. What must MOVE is the rendered coordinate;
// what must NOT is the stored one. A guard that did not distinguish them is
// exactly how the first cure passed its own tests while being wrong.
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import QueryBubble from '@/components/trades/QueryBubble'
import { clampEdgePosition, EDGE_POSITION_KEY } from '@/lib/prefs/edgePosition'
import { emptyFilters } from '@/core/trades/tradesFilter'
import type { ResolverVocabulary } from '@/core/trades/queryResolver'

const VOCAB: ResolverVocabulary = {
  symbols: [], regions: [], countries: [], sectors: [], industries: [],
  playbooks: [], catalystTypes: [], mistakes: [],
}

/** The component's own geometry (QueryBubble.tsx:65-67). */
const DISC_PX = 48
const MARGIN_PX = 24

let addSpy: ReturnType<typeof vi.fn>
let removeSpy: ReturnType<typeof vi.fn>
let realAdd: typeof window.addEventListener
let realRemove: typeof window.removeEventListener

/** How many times the POSITION key was written. A redundant write writes
 *  identical bytes, so comparing the stored string cannot see one -- which is
 *  how beat 276's plant BB2 slipped past its own BA3.
 *
 *  ON THE PROTOTYPE, not the instance: jsdom implements Storage as a Proxy,
 *  so `localStorage.setItem = fn` stores an ITEM named setItem instead of
 *  replacing the method, and the spy would see nothing at all. */
let setItemSpy: ReturnType<typeof vi.fn>
let realSetItem: typeof Storage.prototype.setItem
const positionWrites = () =>
  setItemSpy.mock.calls.filter((c) => c[0] === EDGE_POSITION_KEY).length

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

const resize = () => act(() => { window.dispatchEvent(new Event('resize')) })

const root = () => document.querySelector('[data-edge-root]') as HTMLElement | null
const fab = () => document.querySelector('[data-edge-mark]') as HTMLElement
const leftOf = () => parseFloat(root()?.style.left ?? 'NaN')
const topOf = () => parseFloat(root()?.style.top ?? 'NaN')
const storedRaw = () => window.localStorage.getItem(EDGE_POSITION_KEY)

/** A real carry: down on the disc, past the five-pixel threshold, release.
 *  The component listens on WINDOW for move and up (its dropdown idiom), so
 *  those go to the window and only the down goes to the disc. */
const pointer = (type: string, target: Element | Window, x: number, y: number) =>
  fireEvent(
    target,
    new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }),
  )

function drag(fromX: number, fromY: number, toX: number, toY: number) {
  // THE SHAPE Trades.queryBubble.test.tsx:534-543 ALREADY USES. My first cut
  // dispatched raw events without pointerId or button and with a single move;
  // the drag never armed and BC4 read zero writes for a reason that had
  // nothing to do with the cure.
  pointer('pointerdown', fab(), fromX, fromY)
  pointer('pointermove', window, (fromX + toX) / 2, (fromY + toY) / 2)
  pointer('pointermove', window, toX, toY)
  pointer('pointerup', window, toX, toY)
}

beforeEach(() => {
  window.localStorage.clear()
  setViewport(1920, 1080)
  realSetItem = Storage.prototype.setItem
  setItemSpy = vi.fn()
  Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
    setItemSpy(k, v)
    return realSetItem.call(this, k, v)
  } as typeof Storage.prototype.setItem
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
  Storage.prototype.setItem = realSetItem
  window.addEventListener = realAdd
  window.removeEventListener = realRemove
  cleanup()
})

function mount() {
  return render(
    <QueryBubble
      committed={emptyFilters()}
      vocab={VOCAB}
      liveCount={0}
      onDraft={() => {}}
      onCommit={() => {}}
    />,
  )
}

const resizeAdds = () => addSpy.mock.calls.filter((c) => c[0] === 'resize').length
const resizeRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === 'resize').length

describe('BC the clamp shows, the drag stores', () => {
  it('BC1 on resize the RENDERED coordinate moves inside the viewport', () => {
    // WAS BA1 AND BA2 (276). Both asserted the disc moved on a resize, and it
    // still must -- that is the original symptom, a disc past the right edge
    // with nothing to scroll to. What is new is the word RENDERED: BC2 owns
    // the stored side, and keeping them apart is the whole ruling.
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 500 }))
    mount()
    expect(leftOf(), 'the restore did not honour the stored x').toBe(1848)

    setViewport(900, 1080)
    resize()

    const x = leftOf()
    expect(x, 'the disc did not move when the window shrank').not.toBe(1848)
    expect(x + DISC_PX, 'the disc still hangs past the right edge').toBeLessThanOrEqual(900)
    expect(x, 'the disc went off the LEFT edge instead').toBeGreaterThanOrEqual(MARGIN_PX)
    expect(x).toBe(clampEdgePosition({ x: 1848, y: 500 }, 900, 1080, DISC_PX, MARGIN_PX).x)

    // and VERTICALLY, which is what BA2 covered
    setViewport(900, 400)
    resize()
    const y = topOf()
    expect(y + DISC_PX, 'the disc hangs below the bottom edge').toBeLessThanOrEqual(400)
    expect(y).toBe(clampEdgePosition({ x: 1848, y: 500 }, 900, 400, DISC_PX, MARGIN_PX).y)
  })

  it('BC2 on resize the STORED position is BYTE-IDENTICAL', () => {
    // THE INVERSION. 276 asserted the stored value moved; it must not. A
    // window that happens to be narrow right now is not a decision anyone
    // made, and writing it down turns a temporary shape into a permanent one.
    const intent = JSON.stringify({ x: 1848, y: 500 })
    window.localStorage.setItem(EDGE_POSITION_KEY, intent)
    mount()

    for (const [w, h] of [[900, 1080], [600, 400], [300, 300]] as const) {
      setViewport(w, h)
      resize()
    }

    expect(leftOf(), 'the rendered disc did not follow the window').toBeLessThan(300)
    expect(storedRaw(), 'a resize rewrote the trader intent').toBe(intent)
  })

  it('BC3 shrink then WIDEN returns the disc to where it was put', () => {
    // THE DEFECT, in one case. 276's cure persisted the narrow clamp, so
    // widening left the disc wherever the smallest window had pushed it.
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 500 }))
    mount()
    const wide = leftOf()
    expect(wide).toBe(1848)

    setViewport(900, 1080)
    resize()
    const narrow = leftOf()
    expect(narrow, 'the disc did not move in').toBeLessThan(wide)

    setViewport(1920, 1080)
    resize()
    expect(leftOf(), 'the disc did not come back to where it was put').toBe(wide)
    expect(topOf()).toBe(500)
    expect(storedRaw(), 'the round trip rewrote the intent')
      .toBe(JSON.stringify({ x: 1848, y: 500 }))
  })

  it('BC4 a DRAG writes', () => {
    // Without this, BC2 and BC5 could be satisfied by a component that never
    // writes at all -- which would silently un-ship the carry.
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 500 }))
    const before = storedRaw()
    mount()
    const baseline = positionWrites()

    drag(1848, 500, 200, 300)

    expect(positionWrites() - baseline, 'the drag did not persist').toBeGreaterThan(0)
    expect(storedRaw(), 'the drag left the stored position untouched').not.toBe(before)
    // it snapped to the nearer edge -- the LEFT one, from x=200 of 1920
    expect(JSON.parse(storedRaw()!).x).toBe(MARGIN_PX)
    // AND THE EDGE ITSELF (beat 279). x alone cannot tell a build that stores
    // the anchor from one that forgets it: both write 24 here. The pixel is
    // what the edge resolved to today; the anchor is what was meant.
    expect(JSON.parse(storedRaw()!).anchorX, 'the drag wrote a pixel but not the edge').toBe('left')
  })

  it('BC5 ZERO writes to the key across any number of resizes', () => {
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 900 }))
    // BASELINE AFTER the fixture's own write: the spy is on the prototype and
    // counts everything, this case's own setup included.
    const baseline = positionWrites()
    mount()

    for (const [w, h] of [[900, 800], [600, 500], [1920, 1080], [300, 300], [1920, 1080]] as const) {
      setViewport(w, h)
      resize()
    }

    expect(positionWrites() - baseline, 'a resize wrote to storage').toBe(0)
  })

  it('BC6 a viewport narrower than disc plus margins renders non-negative', () => {
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 900 }))
    mount()

    setViewport(60, 60)
    resize()

    const x = leftOf()
    const y = topOf()
    expect(x, 'a negative coordinate').toBeGreaterThanOrEqual(0)
    expect(y, 'a negative coordinate').toBeGreaterThanOrEqual(0)
    // ASSERTED AGAINST THE CLAMP'S OWN OUTPUT, not a literal: its
    // Math.max(marginPx, ...) floor (edgePosition.ts:65-66) is what makes a
    // negative impossible, and this tracks it rather than restating it.
    expect({ x, y }).toEqual(clampEdgePosition({ x: 1848, y: 900 }, 60, 60, DISC_PX, MARGIN_PX))
    expect(x, 'the floor is not the margin').toBe(MARGIN_PX)
  })

  it('BC7 CONTROL: no stored position means the CSS corner and no write', () => {
    expect(storedRaw(), 'the fixture left a position behind').toBe(null)
    const baseline = positionWrites()
    mount()
    expect(root()?.style.left, 'an inline left appeared without a drag').toBe('')
    expect(root()?.className).toContain('bottom-6')
    expect(root()?.className).toContain('right-6')

    setViewport(700, 500)
    resize()

    expect(storedRaw(), 'the resize invented a position').toBe(null)
    expect(positionWrites() - baseline, 'the resize wrote to the position key').toBe(0)
    expect(root()?.style.left, 'the resize pinned an inline coordinate').toBe('')
    expect(root()?.className, 'the CSS corner was dropped').toContain('bottom-6')
  })

  it('BC8 CONTROL: edgePosition.ts is pinned, by md5', () => {
    // THE PIN MOVED ONCE, IN BEAT 279, AND FOR A NAMED REASON: the type gained
    // an optional anchorX and the reader learned to preserve it. Beat 277 had
    // ruled the file untouchable because its own claim was that the clamp was
    // correct and only its callers were wrong -- which was true of 277 and is
    // still true now. clampEdgePosition itself is byte-for-byte what it was.
    const src = readFileSync(join(process.cwd(), 'src/lib/prefs/edgePosition.ts'))
    expect(
      createHash('md5').update(src).digest('hex'),
      'edgePosition.ts moved -- the clamp is correct, so ask what a caller wanted instead',
    ).toBe('e5340a921c16d054bfda8d8dc7da538f')
  })

  it('BC9 the PANEL follows, at every width driven', () => {
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 1848, y: 500 }))
    mount()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })
    const panel = document.querySelector('[data-edge-root] .card-premium') as HTMLElement | null
    expect(panel, 'the panel did not open').toBeTruthy()
    // ABSOLUTE INSIDE THE FIXED ROOT (QueryBubble.tsx:539), so it follows the
    // disc by construction -- measured here, not assumed.
    expect(panel?.className).toContain('absolute')
    expect(root()?.contains(panel!), 'the panel escaped the root').toBe(true)

    for (const w of [900, 600, 1920]) {
      setViewport(w, 1080)
      resize()
      expect(leftOf() + DISC_PX, 'the root is off screen at ' + w).toBeLessThanOrEqual(w)
    }
  })

  it('BC10 the resize listener is removed on unmount', () => {
    // WAS BA7, unchanged in intent: a listener that outlives its component
    // keeps a dead closure alive and fires against an unmounted tree.
    window.localStorage.setItem(EDGE_POSITION_KEY, JSON.stringify({ x: 200, y: 300 }))
    const view = mount()
    const added = resizeAdds()
    expect(added, 'no resize listener was registered').toBeGreaterThan(0)
    view.unmount()
    expect(resizeRemoves(), 'the resize listener outlived the component').toBe(added)
  })
})

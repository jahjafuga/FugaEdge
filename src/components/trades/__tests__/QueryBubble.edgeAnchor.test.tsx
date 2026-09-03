// @vitest-environment jsdom
//
// THE ANCHOR: A DROP AGAINST AN EDGE REMEMBERS THE EDGE, NOT THE PIXEL.
//
// Beat 277 settled who may write: the stored position is the trader's INTENT
// and only a drag may change it. This settles WHAT is written. A coordinate is
// the wrong unit for an edge drop, because an edge is a fact about the window
// and a coordinate is a fact about one particular width of it. x=1352 means
// "flush right" on a 1424 window and "somewhere left of centre" on a 1920 one,
// and nothing stored distinguishes those two readings.
//
// THE DRAG NEVER PRODUCED A FREE HORIZONTAL COORDINATE. QueryBubble.tsx:538
// forces x to MARGIN_PX or viewportW - MARGIN_PX - DISC_PX on every release,
// so every stored x has always been an edge. The founder's own dev store bears
// this out: seventeen positions written, every x either 1352 or 1848 -- right
// edge at 1424 and right edge at 1920 -- and the left snap, x=24, never once.
// The side was decided at :536, used on the next line, and thrown away. All
// this beat does is keep it.
//
// ADDITIVE. The blob keeps numeric x and y and gains one optional field. A
// blob without it is LEGACY, not corrupt, and is honoured as a coordinate --
// BE5 pins that, because an anchor that quietly ate the old behaviour would be
// a second one-way ratchet in the opposite direction.
//
// BE7 IS A DEFECT BEAT 277 SHIPPED. It took the drag's origin from `pos`, the
// intent, while the disc is drawn at `shown`. Before 277 those were the same
// value. After it they are not, and once a shrink has stranded the intent the
// carry goes dead in the stranded direction: at a 900 window the pointer must
// travel 1020px before the disc responds at all.
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QueryBubble from '@/components/trades/QueryBubble'
import { EDGE_POSITION_KEY } from '@/lib/prefs/edgePosition'
import { emptyFilters } from '@/core/trades/tradesFilter'
import type { ResolverVocabulary } from '@/core/trades/queryResolver'

const VOCAB: ResolverVocabulary = {
  symbols: [], regions: [], countries: [], sectors: [], industries: [],
  playbooks: [], catalystTypes: [], mistakes: [],
}

/** The component's own geometry (QueryBubble.tsx:66-67). */
const DISC_PX = 48
const MARGIN_PX = 24

/** Flush right, for a given width. The formula QueryBubble.tsx:538 uses. */
const flushRight = (w: number) => w - MARGIN_PX - DISC_PX

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
const stored = () => JSON.parse(storedRaw() ?? 'null')

/** Seeded as a RAW STRING, deliberately. These are blobs as they exist on
 *  disk, written by some build or other, and the test must not depend on the
 *  current type to describe one. */
const seed = (raw: string) => window.localStorage.setItem(EDGE_POSITION_KEY, raw)

const pointer = (type: string, target: Element | Window, x: number, y: number) =>
  fireEvent(
    target,
    new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }),
  )

/** A real carry: down on the disc, past the five-pixel threshold, release.
 *  The shape Trades.queryBubble.test.tsx:534-543 already uses. */
function drag(fromX: number, fromY: number, toX: number, toY: number) {
  pointer('pointerdown', fab(), fromX, fromY)
  pointer('pointermove', window, (fromX + toX) / 2, (fromY + toY) / 2)
  pointer('pointermove', window, toX, toY)
  pointer('pointerup', window, toX, toY)
}

/** A carry HELD, not released. BE7 has to look at the disc mid-drag: the
 *  release snaps x to an edge and would hide the very thing it measures. */
function carry(fromX: number, fromY: number, toX: number, toY: number) {
  pointer('pointerdown', fab(), fromX, fromY)
  pointer('pointermove', window, (fromX + toX) / 2, (fromY + toY) / 2)
  pointer('pointermove', window, toX, toY)
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
})

afterEach(() => {
  Storage.prototype.setItem = realSetItem
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

describe('BE the edge is what is remembered', () => {
  it('BE1 a right-edge drop writes x, y AND an anchor marking right', () => {
    setViewport(1920, 1080)
    seed(JSON.stringify({ x: 1848, y: 500 }))
    mount()
    // down on the disc, a short carry that stays right of centre
    drag(1872, 524, 1800, 600)
    const s = stored()
    expect(s.x, 'the right snap moved off the flush pixel').toBe(flushRight(1920))
    expect(typeof s.y, 'y stopped being a number').toBe('number')
    expect(s.anchorX, 'a right-edge drop did not record the edge').toBe('right')
  })

  it('BE2 a left-edge drop writes an anchor marking left', () => {
    setViewport(1920, 1080)
    seed(JSON.stringify({ x: 1848, y: 500 }))
    mount()
    // carried well past the midline: 1848 - 972 = 876, and 876 + 24 < 960
    drag(1872, 524, 900, 524)
    const s = stored()
    expect(s.x, 'the left snap moved off the margin').toBe(MARGIN_PX)
    expect(s.anchorX, 'a left-edge drop did not record the edge').toBe('left')
  })

  it('BE3 an anchored-right blob renders flush from the LIVE viewport', () => {
    // 1352 is the founder's real stored value, written on a 1424 window.
    // AT 1424 THE CLAMP AND THE ANCHOR AGREE, which is exactly why the other
    // two widths are here: a clamp can only ever pull IN, so only a width
    // WIDER than the stored coordinate can tell the two apart.
    seed(JSON.stringify({ x: 1352, y: 500, anchorX: 'right' }))
    setViewport(1424, 1080)
    mount()
    expect(leftOf(), 'flush right at the width it was dropped at').toBe(flushRight(1424))

    setViewport(1920, 1080)
    resize()
    expect(leftOf(), 'a wider window left it at the old pixel').toBe(flushRight(1920))

    setViewport(2560, 1080)
    resize()
    expect(leftOf(), 'wider still and it did not follow').toBe(flushRight(2560))
    expect(topOf(), 'the free axis moved').toBe(500)
  })

  it('BE4 shrink then widen: flush right at every width. THE FEATURE', () => {
    seed(JSON.stringify({ x: 1352, y: 500, anchorX: 'right' }))
    setViewport(1920, 1080)
    // BASELINED AFTER THE SEED. The spy is on Storage.prototype, installed
    // before the test body runs, so seeding a fixture is itself a write to the
    // key -- my first cut of this case read that 1 as the component writing.
    const baseline = positionWrites()
    mount()
    expect(leftOf(), 'not flush at the opening width').toBe(1848)

    setViewport(900, 1080)
    resize()
    expect(leftOf(), 'not flush after the shrink').toBe(828)

    setViewport(1920, 1080)
    resize()
    expect(leftOf(), 'widening did not bring it back to the edge').toBe(1848)
    expect(positionWrites() - baseline, 'showing wrote to storage').toBe(0)
  })

  it('BE5 a LEGACY blob is a coordinate, and stays one', () => {
    // 277's behaviour, preserved to the pixel. An anchor that quietly ate the
    // old blobs would be a ratchet in the other direction: every position ever
    // stored would jump to an edge on the next launch.
    seed(JSON.stringify({ x: 1352, y: 500 }))
    setViewport(1920, 1080)
    mount()
    expect(leftOf(), 'a legacy blob was treated as anchored').toBe(1352)

    setViewport(900, 1080)
    resize()
    expect(leftOf(), 'the display clamp stopped working').toBe(828)

    setViewport(1920, 1080)
    resize()
    expect(leftOf(), 'widening did not return it to ITS OWN coordinate').toBe(1352)
    expect(storedRaw(), 'the legacy blob was rewritten').toBe(JSON.stringify({ x: 1352, y: 500 }))
  })

  it('BE6 the written blob is exactly x, y and the anchor', () => {
    // THE KEY SET, not a spot check. A y anchor arriving unannounced and an x
    // quietly vanishing are both shape changes, and both are downgrade
    // hazards: an older build reads x and y and nothing else.
    setViewport(1920, 1080)
    seed(JSON.stringify({ x: 1848, y: 500 }))
    mount()
    drag(1872, 524, 1800, 600)
    expect(Object.keys(stored()).sort()).toEqual(['anchorX', 'x', 'y'])
    expect(typeof stored().x).toBe('number')
    expect(typeof stored().y).toBe('number')
  })

  it('BE7 THE DEAD ZONE: a stranded intent still drags from where it is shown', () => {
    // Intent 1848 in a 900 window: the disc is SHOWN at 828 and `pos` is 1848.
    // Beat 277 took the drag origin from pos, so 1848 + dx stayed past maxX
    // and the clamp pinned it -- the disc did not move until the pointer had
    // travelled the whole 1020px of stranding.
    seed(JSON.stringify({ x: 1848, y: 500 }))
    setViewport(900, 1080)
    mount()
    expect(leftOf(), 'the fixture is wrong: it should open stranded-and-clamped').toBe(828)

    carry(852, 524, 822, 524) // 30px left, held
    expect(leftOf(), 'the disc is pinned at 828: the origin is the intent, not the disc').toBe(798)
  })

  it('BE8 an anchored blob at a 60x60 viewport renders non-negative', () => {
    // flushRight(60) is -12. The floor at edgePosition.ts:65 is the only thing
    // standing between an anchored axis and a negative coordinate.
    seed(JSON.stringify({ x: 1848, y: 900, anchorX: 'right' }))
    setViewport(60, 60)
    mount()
    expect(flushRight(60), 'the arithmetic this case exists for').toBeLessThan(0)
    expect(leftOf(), 'the anchored axis went negative').toBe(MARGIN_PX)
    expect(leftOf()).toBeGreaterThanOrEqual(0)
    expect(topOf()).toBeGreaterThanOrEqual(0)
  })

  it('BE9 CONTROL: no stored blob means the CSS corner and no write', () => {
    setViewport(1920, 1080)
    expect(storedRaw(), 'the fixture left a position behind').toBe(null)
    const baseline = positionWrites()
    mount()
    setViewport(900, 500)
    resize()
    expect(storedRaw(), 'mounting or resizing invented a position').toBe(null)
    expect(positionWrites() - baseline, 'something wrote to the position key').toBe(0)
    expect(root()?.style.left, 'an inline coordinate was pinned').toBe('')
    expect(root()?.className, 'the CSS corner was dropped').toContain('bottom-6')
  })
})

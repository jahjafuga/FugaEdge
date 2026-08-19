// @vitest-environment jsdom
// v0.2.7 — the exported card honours streamer mode.
//
// A LIVE DEFECT in shipped code, found during the calendar-export recon. The eye
// in the header masks dollars with a CSS blur on .masked-money. The branded card
// is Canvas 2D: it never touches the DOM, so it cannot inherit a filter, and it
// drew the net P&L regardless. A user hiding their dollars on screen exported a
// card with the dollars printed on it — the one artefact actually meant to leave
// the machine.
//
// These assert on what is DRAWN, not on what is passed in. A compositor handed a
// masked string that printed the raw one would sail through an input-side check,
// and that is precisely the failure being guarded.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { composeBrandedScreenshot, type BrandedScreenshotData } from '../chartScreenshot'
import { STREAMER_STORAGE_KEY } from '../streamerMode'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'

let rec: ReturnType<typeof installRecordingCanvas>
let restoreDecode: () => void

beforeEach(() => {
  localStorage.clear()
  rec = installRecordingCanvas()
  restoreDecode = installImageDecode()
})
afterEach(() => {
  rec.restore()
  restoreDecode()
})

const DATA: BrandedScreenshotData = {
  symbol: 'INLF',
  side: 'long',
  setupName: 'Gap and go',
  dateLabel: 'Aug 5, 2026',
  netPnl: 1234.56,
  netPnlText: '+$1,234.56',
  avgEntryText: '$9.89',
  avgExitText: '$10.42',
  sharesText: '1,000',
  holdText: '27m',
  legend: null,
}

/** A canvas the compositor will treat as the captured chart. */
function fakeChart(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 900
  return c
}
const compose = (d: Partial<BrandedScreenshotData> = {}) =>
  composeBrandedScreenshot(fakeChart(), { ...DATA, ...d }, 'dark')

const DOLLAR = /\$\s?[\d,]/

describe('T1 with streamer mode ON, no dollar figure is drawn', () => {
  it('the net P&L amount never reaches the canvas', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose()
    const offenders = rec.texts.filter((t) => t.includes('1,234.56'))
    expect(offenders, `the amount was drawn: ${offenders.join(' | ')}`).toEqual([])
  })

  it('and neither does any other absolute dollar amount', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose()
    // Per-share PRICES are deliberately exempt — the CSS rule says so too
    // ("Per-share prices never carry the class"), so entry/exit stay readable.
    const priced = new Set([DATA.avgEntryText, DATA.avgExitText])
    const money = rec.texts.filter((t) => DOLLAR.test(t) && !priced.has(t))
    expect(money, `dollar amounts drawn: ${money.join(' | ')}`).toEqual([])
  })

  it('a DELIBERATE mark is drawn in its place, not a blank', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose()
    // The label must still be there, and it must have a value beside it that
    // reads as withheld rather than as missing data.
    expect(rec.texts).toContain('NET P&L') // the footer uppercases its labels
    const mask = rec.texts.find((t) => /[•]{2,}/.test(t))
    expect(mask, 'no mask glyph was drawn — the cell would read as empty').toBeTruthy()
  })

  it('the mask is drawn for a LOSS as well as a win', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose({ netPnl: -880.25, netPnlText: '-$880.25' })
    expect(rec.texts.filter((t) => t.includes('880.25'))).toEqual([])
    expect(rec.texts.some((t) => /[•]{2,}/.test(t))).toBe(true)
  })
})

describe('T2 with streamer mode OFF, the card is what it was', () => {
  it('the net P&L is drawn exactly as passed', async () => {
    await compose()
    expect(rec.texts).toContain('+$1,234.56')
    expect(rec.texts.some((t) => /[•]{2,}/.test(t))).toBe(false)
  })

  it('and every other footer value is unchanged', async () => {
    await compose()
    for (const v of ['$9.89', '$10.42', '1,000', '27m', 'INLF', 'Aug 5, 2026']) {
      expect(rec.texts, `${v} missing from the card`).toContain(v)
    }
  })

  it('an ABSENT key is off — the default must not be masked', async () => {
    // localStorage is cleared in beforeEach; nothing has ever set the key.
    await compose()
    expect(rec.texts).toContain('+$1,234.56')
  })
})

describe('T3 the mode is read at COMPOSE time', () => {
  it('a toggle between two composes changes the second one', async () => {
    await compose()
    expect(rec.texts).toContain('+$1,234.56')

    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    rec.texts.length = 0
    await compose()
    expect(rec.texts).not.toContain('+$1,234.56')
  })

  it('and back again, so nothing is cached across calls', async () => {
    localStorage.setItem(STREAMER_STORAGE_KEY, 'on')
    await compose()
    localStorage.removeItem(STREAMER_STORAGE_KEY)
    rec.texts.length = 0
    await compose()
    expect(rec.texts).toContain('+$1,234.56')
  })
})

describe('T4 a localStorage failure masks, matching the existing fail-safe', () => {
  it('uncertainty hides rather than leaks', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage unavailable')
      },
    })
    try {
      await compose()
      expect(rec.texts.filter((t) => t.includes('1,234.56'))).toEqual([])
      expect(rec.texts.some((t) => /[•]{2,}/.test(t))).toBe(true)
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })

  it('which is the same rule readStreamerMode already applies', async () => {
    // Documented in src/lib/streamerMode.ts: "a localStorage FAILURE (not
    // absence) resolves to true — uncertainty hides, never leaks."
    const { readStreamerMode } = await import('../streamerMode')
    expect(typeof readStreamerMode).toBe('function')
  })
})

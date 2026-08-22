// v0.2.7 — THE CAPTURE HARNESS GRADUATES.
//
// Inserted into the main entry and reverted byte-identical twice, the
// self-photography hook earned permanence by being needed twice. It lives in
// a dev-only module now, and THE CONTRACT IS THE NO-OP: with
// FUGAEDGE_CAPTURE_DIR absent the module wires NOTHING — zero listeners,
// zero behaviour change, zero risk to a packaged or ordinary dev run. Only
// under the variable does it attach its one did-finish-load listener.

import { afterEach, describe, expect, it } from 'vitest'
import { installCaptureRun, CAPTURE_SEQUENCE } from '../captureRun'

const ORIGINAL = process.env.FUGAEDGE_CAPTURE_DIR

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FUGAEDGE_CAPTURE_DIR
  else process.env.FUGAEDGE_CAPTURE_DIR = ORIGINAL
})

/** The narrowest fake the module's activation path touches. */
function fakeWin() {
  const onceCalls: string[] = []
  return {
    onceCalls,
    win: {
      setSize: () => {},
      center: () => {},
      webContents: {
        once: (ev: string) => void onceCalls.push(ev),
        sendInputEvent: () => {},
        executeJavaScript: () => Promise.resolve(null),
        capturePage: () => Promise.resolve({ toPNG: () => Buffer.alloc(0) }),
      },
    } as never,
    app: { quit: () => {} } as never,
  }
}

describe('the no-op contract', () => {
  it('with the env var ABSENT: returns false, wires zero listeners', () => {
    delete process.env.FUGAEDGE_CAPTURE_DIR
    const f = fakeWin()
    const active = installCaptureRun(f.win, f.app)
    expect(active, 'the harness activated without its env var').toBe(false)
    expect(f.onceCalls, 'a listener was wired in the no-op path').toEqual([])
  })

  it('with the env var SET: activates and wires exactly one load listener', () => {
    process.env.FUGAEDGE_CAPTURE_DIR = 'C:/somewhere/frames'
    const f = fakeWin()
    const active = installCaptureRun(f.win, f.app)
    expect(active).toBe(true)
    expect(f.onceCalls).toEqual(['did-finish-load'])
  })
})

describe('the sequence is data', () => {
  it('ten numbered frames, each with a caption', () => {
    expect(CAPTURE_SEQUENCE).toHaveLength(10)
    const frames = CAPTURE_SEQUENCE.map((s) => s.frame)
    expect(frames).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
    for (const s of CAPTURE_SEQUENCE) {
      expect(s.caption.length, `frame ${s.frame} has no caption`).toBeGreaterThan(0)
    }
  })
})

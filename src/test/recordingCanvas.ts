/**
 * recordingCanvas — a test-only 2D context that RECORDS what was drawn.
 *
 * WHY: jsdom implements no canvas, and the `canvas` package is not a dependency
 * (and should not become one for a test). But the only honest way to assert that
 * a composited image does not contain a dollar figure is to look at what was
 * DRAWN, not at what was passed in — a compositor that receives a masked string
 * and prints the raw one would pass an input-side assertion.
 *
 * WHAT: getContext('2d') returns a stub whose drawing calls are no-ops except
 * that every fillText / strokeText string is appended to `texts`. Geometry is
 * ignored deliberately: these tests are about WHAT is written, not where.
 *
 * HOW (to keep it non-fragile): every method the compositor calls is present and
 * inert. If the compositor starts using another 2D method, ADD it here as a
 * no-op rather than reaching for a real canvas implementation.
 */

export interface RecordingCanvas {
  /** Every string handed to fillText / strokeText, in draw order. */
  texts: string[]
  /** Restore the original getContext. Call in afterEach. */
  restore: () => void
}

export function installRecordingCanvas(): RecordingCanvas {
  const texts: string[] = []
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown
    toBlob?: unknown
  }
  const originalGetContext = proto.getContext
  const originalToBlob = proto.toBlob

  const ctx = {
    // recorded
    fillText: (t: string) => void texts.push(String(t)),
    strokeText: (t: string) => void texts.push(String(t)),
    // measured
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    // inert
    fillRect: () => {},
    drawImage: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    // settable properties
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
  }

  proto.getContext = function getContext(kind: string) {
    return kind === '2d' ? ctx : null
  }
  // The compositor's caller encodes with toBlob; a stub keeps that path callable.
  proto.toBlob = function toBlob(cb: (b: Blob | null) => void) {
    cb(new Blob([new Uint8Array([1])], { type: 'image/png' }))
  }

  return {
    texts,
    restore() {
      proto.getContext = originalGetContext
      proto.toBlob = originalToBlob
    },
  }
}

/** Stub HTMLImageElement.decode so the compositor's icon load resolves in jsdom. */
export function installImageDecode(): () => void {
  const proto = HTMLImageElement.prototype as unknown as { decode?: unknown }
  const original = proto.decode
  proto.decode = function decode() {
    return Promise.resolve()
  }
  return () => {
    proto.decode = original
  }
}

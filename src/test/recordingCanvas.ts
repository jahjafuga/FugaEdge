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
 * that every fillText / strokeText string is appended to `texts`, and every
 * fill() / stroke() is appended to `shapes` with the bounding box of the path
 * that produced it.
 *
 * WHY POSITIONS TOO (v0.2.7 Feature 5): dead space is measured from the last
 * INK on the card, and on a sparse month the last row has numerals but no boxes
 * — empty days lose their boxes by design. A box-only measurement reported a
 * fifth of the card empty when it was not.
 *
 * WHY SHAPES TOO (v0.2.7 Feature 5): "empty days lose their boxes" is a rule
 * about geometry, not text. A mutation that gave every untouched day its outline
 * back passed a text-only guard cleanly — the card looked broken and the suite
 * was green. Bounding boxes are the least instrumentation that can catch it:
 * still no real canvas, still no dependency, but a shape assertion is now
 * possible.
 *
 * HOW (to keep it non-fragile): every method the compositor calls is present and
 * inert. If the compositor starts using another 2D method, ADD it here as a
 * no-op rather than reaching for a real canvas implementation.
 */

/** One painted path: how it was painted, and the box it covered. */
export interface RecordedShape {
  op: 'fill' | 'stroke' | 'fillRect'
  x: number
  y: number
  w: number
  h: number
  /** The fillStyle / strokeStyle in force when it was painted. Recorded because
   *  "the header band resolves a surface distinct from the grid ground" is a
   *  rule about PAINT, and geometry alone cannot see it. */
  style: string
}

/** One drawn string, with where it was drawn and the fill it was drawn in.
 *
 *  The style matters because the app's stat line is COLOURED — win% gold,
 *  winners green, losers red — and the card's first port flattened it to grey.
 *  A text-only recorder cannot tell those two apart. */
export interface RecordedText {
  text: string
  x: number
  y: number
  style: string
  /** The full font shorthand in force, e.g. "700 17px JetBrains Mono, ...". */
  font: string
  /** left | center | right — which side of `x` the run sits on. */
  align: string
  /** Point size parsed out of `font`. 0 when it cannot be read. */
  size: number
  /** Estimated advance width. The card's face is monospace, so
   *  chars x size x MONO_ADVANCE is faithful to within a pixel — enough to
   *  answer "did this paint outside its box", which is the only question the
   *  overflow guard asks. */
  width: number
}

/** JetBrains Mono's advance, in ems. Every glyph is this wide. */
export const MONO_ADVANCE = 0.6

/** Point size out of a CSS font shorthand. */
export function fontSizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 0
}

/** The monospace width estimate the guard and the compositor both use. */
export function monoWidth(text: string, font: string): number {
  return text.length * fontSizeOf(font) * MONO_ADVANCE
}

export interface RecordingCanvas {
  /** Every string handed to fillText / strokeText, in draw order. */
  texts: string[]
  /** The same strings, with their baselines and their fills. */
  textPoints: RecordedText[]
  /** Every fill() / stroke() / fillRect(), with its bounding box. */
  shapes: RecordedShape[]
  /** Restore the original getContext. Call in afterEach. */
  restore: () => void
}

export function installRecordingCanvas(): RecordingCanvas {
  const texts: string[] = []
  const textPoints: RecordedText[] = []
  const shapes: RecordedShape[] = []

  // Bounding box of the path under construction. Every coordinate any path
  // method is handed widens it; beginPath resets it. Crude on purpose — a
  // rounded rect's arcTo control points ARE its corners, so the box is exact
  // for the only shapes this card draws.
  let bx0 = Infinity
  let by0 = Infinity
  let bx1 = -Infinity
  let by1 = -Infinity
  const reset = () => {
    bx0 = Infinity
    by0 = Infinity
    bx1 = -Infinity
    by1 = -Infinity
  }
  const at = (...xy: number[]) => {
    for (let i = 0; i < xy.length; i += 2) {
      const x = xy[i]
      const y = xy[i + 1]
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
    }
  }
  const record = (text: string, x: number, y: number, style: string): RecordedText => ({
    text,
    x,
    y,
    style,
    font: String(ctx.font),
    align: String(ctx.textAlign || 'left'),
    size: fontSizeOf(String(ctx.font)),
    width: monoWidth(text, String(ctx.font)),
  })

  const emit = (op: 'fill' | 'stroke') => {
    if (bx0 === Infinity) return
    shapes.push({
      op,
      x: bx0,
      y: by0,
      w: bx1 - bx0,
      h: by1 - by0,
      style: String(op === 'fill' ? ctx.fillStyle : ctx.strokeStyle),
    })
  }
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown
    toBlob?: unknown
  }
  const originalGetContext = proto.getContext
  const originalToBlob = proto.toBlob

  const ctx = {
    // recorded
    fillText: (t: string, x = 0, y = 0) => {
      texts.push(String(t))
      textPoints.push(record(String(t), x, y, String(ctx.fillStyle)))
    },
    strokeText: (t: string, x = 0, y = 0) => {
      texts.push(String(t))
      textPoints.push(record(String(t), x, y, String(ctx.strokeStyle)))
    },
    // measured — the SAME estimate the guard uses, so a compositor that fits its
    // text to measureText and a guard that checks the fit cannot disagree in
    // jsdom. Chromium's real metric for a monospace face is this value.
    measureText: (t: string) => ({ width: monoWidth(String(t), String(ctx.font)) }),
    // recorded geometry (styles are read off `ctx` at paint time)
    fillRect: (x: number, y: number, w: number, h: number) =>
      void shapes.push({ op: 'fillRect', x, y, w, h, style: String(ctx.fillStyle) }),
    beginPath: () => reset(),
    closePath: () => {},
    moveTo: (x: number, y: number) => at(x, y),
    lineTo: (x: number, y: number) => at(x, y),
    arcTo: (x1: number, y1: number, x2: number, y2: number) => at(x1, y1, x2, y2),
    fill: () => emit('fill'),
    stroke: () => emit('stroke'),
    // inert
    drawImage: () => {},
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
    textPoints,
    shapes,
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

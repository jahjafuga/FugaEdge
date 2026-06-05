// Ladder fill markers — a custom lightweight-charts ISeriesPrimitive that draws,
// per fill: a small dot ON the bar at the exact fill price, a thin leader line,
// and a "QTY @ PRICE" pill in clear space (green buy / red sell), de-collided
// vertically by the pure layoutFillLadder. Replaces the old createSeriesMarkers
// blob dots. Chart-API-coupled (canvas drawing) but NOT React — the pure geometry
// lives in src/lib/fillLadderLayout.ts.
//
// lightweight-charts is imported types-only (erased at build) so this doesn't pull
// the ~110KB runtime into ChartTab's eager graph — ChartTab still dynamic-imports it.
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { TradeMarker } from '@/core/charts/buildTradeMarkers'
import { layoutFillLadder, type OccupancyRect, type PlacedPill } from '@/lib/fillLadderLayout'
import { int, price } from '@/lib/format'

// The canvas target type isn't re-exported by lightweight-charts; derive it from
// the renderer interface so we don't depend on the transitive 'fancy-canvas' pkg.
type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

// One pill's fully-resolved paint data, frozen at rebuild time (CSS px + bitmap
// textW). The paint loop reads ONLY these fields; the coalesce cache stores them.
type CachedPill = {
  kind: PlacedPill['kind']
  pillX: number
  pillY: number
  x: number
  y: number
  label: string
  size: number
  textW: number
}

const COLOR_ENTRY = '#3fb389' // win (matches the candle/avg palette)
const COLOR_EXIT = '#e06b6b'  // loss
const COLOR_LEADER = 'rgba(243,245,250,0.40)' // faint fg-primary
const COLOR_DOT_RING = '#0c0f16' // near-bg ring so the dot reads on any candle
const COLOR_PILL_TEXT = '#f3f5fa'

// All CSS px (scaled to bitmap px in draw via the scope pixel ratios).
const PILL_FONT_PX = 10
const PILL_H = 16
const PILL_PAD_X = 6
const PILL_RADIUS = 3
const LEADER_MIN = 12 // shortest leader — pill sits this far from the dot when free
const LEADER_MAX = 140 // longest leader before we place at leaderMax anyway
const MIN_GAP = 4
const DOT_BASE_R = 2.5 // + marker size (1..4)

function toSeconds(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// [LADDER-FREQ] TEMP diagnostic state — aggregate redraw frequency/redundancy.
// Remove together with the draw() probe once the freeze is characterized.
let freqDraws = 0
let freqWindowStart = performance.now()
let freqRangeUnchanged = 0
let freqMsSum = 0
let freqMsMin = Infinity
let freqMsMax = 0
let freqLayoutSum = 0
let freqLayoutMin = Infinity
let freqLayoutMax = 0
let freqPaintSum = 0
let freqPaintMin = Infinity
let freqPaintMax = 0
let freqReused = 0
let freqLastBars = 0
let freqLastRects = 0
let freqLastSumRectH = 0
let freqLastMaxRectH = 0
let freqLastMaxRectAbsY = 0
let freqLastRange: { from: number; to: number } | null = null
const FREQ_EVERY = 20 // emit one line per 20 draws (~0.33s at 60fps) — small so we catch lines near the freeze cliff
// [LADDER-DIAG] THROTTLE TEST — cap real redraws to at most 1 per THROTTLE_MS (~10/sec).
let lastRealDrawAt = 0
const THROTTLE_MS = 100

class FillLadderRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly src: FillLadderPrimitive) {}

  // [coalesce] cached pixel geometry — rebuilt at most once per BUDGET_MS and
  // reused by the library's ~180/sec mouse-move redraws in between. Hard-
  // invalidated on marker identity / pane size / DPI change (see draw()).
  private cache_: {
    pills: CachedPill[]
    markersRef: readonly TradeMarker[]
    paneW: number
    paneH: number
    hr: number
    vr: number
    builtAt: number
  } | null = null

  draw(target: DrawTarget): void {
    const { chart, series, markers } = this.src
    if (!chart || !series || markers.length === 0) return
    // [LADDER-DIAG] THROTTLE TEST — do real work (geometry + paint) at most once per
    // THROTTLE_MS; on a throttled call return immediately and draw nothing. NOTE: at
    // 'normal' z-order the library already cleared+redrew the main canvas this frame, so
    // skipping our draw makes the pills BLINK OUT for that frame (not "persist") — that's
    // expected for this diagnostic.
    const tNow = performance.now()
    if (tNow - lastRealDrawAt < THROTTLE_MS) return
    lastRealDrawAt = tNow
    const ts = chart.timeScale()

    target.useBitmapCoordinateSpace((scope) => {
      const t0 = performance.now() // [LADDER-FREQ] temp
      const ctx = scope.context
      const hr = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      const paneW = scope.mediaSize.width
      const paneH = scope.mediaSize.height

      // === COALESCE: rebuild the geometry at most once per BUDGET_MS; the
      // library's ~180/sec mouse-move redraws repaint from the pixel cache in
      // between. Marker-identity / pane-size / DPI changes hard-invalidate
      // (bypass the budget). Visible range is deliberately NOT a key — it jitters
      // every frame, so the monotonic time budget governs pan/zoom.
      const now = performance.now()
      const BUDGET_MS = 16
      const c = this.cache_
      const canReuse =
        c !== null &&
        c.markersRef === markers &&
        c.paneW === paneW &&
        c.paneH === paneH &&
        c.hr === hr &&
        c.vr === vr &&
        now - c.builtAt < BUDGET_MS

      // Font + baseline feed BOTH the rebuild's measureText and the paint loop's
      // fillText, and the canvas is cleared every draw — so set them every frame
      // (cheap), before either path runs.
      ctx.font = `600 ${PILL_FONT_PX * vr}px JetBrains Mono, ui-monospace, monospace`
      ctx.textBaseline = 'middle'

      let pills: CachedPill[]
      let layoutMs = 0 // [LADDER-FREQ] stays 0 on a cache hit (no layout call)
      if (canReuse && c) {
        // && c: canReuse already implies non-null; this re-narrows for the type checker.
        pills = c.pills
      } else {
        // ---- REBUILD ----
        // Fills → CSS-px points; drop any off the visible range.
        const pts: { x: number; y: number; qty: number; price: number; kind: 'entry' | 'exit'; side: 'B' | 'S'; size: number }[] = []
        for (const m of markers) {
          const x = ts.timeToCoordinate(toSeconds(m.time))
          const y = series.priceToCoordinate(m.price)
          if (x === null || y === null) continue
          pts.push({ x, y, qty: m.qty, price: m.price, kind: m.kind, side: m.side, size: m.size })
        }
        if (pts.length === 0) {
          this.cache_ = null // nothing on-screen → drop the cache so no stale paint
          return
        }

        // Label widths → layout reserves the WIDEST (CSS px) so a drawn pill never
        // overflows the slot the free-space search cleared.
        const labels = pts.map((p) => `${int(p.qty)} @ ${price(p.price)}`)
        let maxTextCss = 0
        for (const lb of labels) maxTextCss = Math.max(maxTextCss, ctx.measureText(lb).width / hr)
        const pillWidth = maxTextCss + 2 * PILL_PAD_X

        // Candle occupancy — visible logical-range slice (+ pad); single series.data().
        const bars = series.data()
        const candleRects: OccupancyRect[] = []
        const barSpacing = ts.options().barSpacing
        const vlr = ts.getVisibleLogicalRange()
        const VIS_PAD = 2 // bars of slack on each side of the visible range
        const firstBar = vlr ? Math.max(0, Math.floor(vlr.from) - VIS_PAD) : 0
        const lastBar = vlr ? Math.min(bars.length - 1, Math.ceil(vlr.to) + VIS_PAD) : bars.length - 1
        for (let i = firstBar; i <= lastBar; i++) {
          const b = bars[i]
          if (!('high' in b) || !('low' in b)) continue // skip whitespace points
          const cx = ts.timeToCoordinate(b.time)
          if (cx === null || cx < -barSpacing || cx > paneW + barSpacing) continue
          const yh = series.priceToCoordinate(b.high)
          const yl = series.priceToCoordinate(b.low)
          if (yh === null || yl === null) continue
          candleRects.push({ x: cx - barSpacing / 2, y: yh, w: barSpacing, h: yl - yh })
        }
        // Avg-entry / avg-exit bands (Σ price·qty / Σ qty per role).
        const avgBands: { y: number; h: number }[] = []
        for (const role of ['entry', 'exit'] as const) {
          let dollars = 0
          let qty = 0
          for (const m of markers) {
            if (m.kind === role) {
              dollars += m.price * m.qty
              qty += m.qty
            }
          }
          if (qty <= 0) continue
          const ay = series.priceToCoordinate(dollars / qty)
          if (ay !== null) avgBands.push({ y: ay, h: PILL_H })
        }

        const tLayout0 = performance.now() // [LADDER-FREQ] temp
        const placed = layoutFillLadder(pts, {
          paneWidth: paneW,
          paneHeight: paneH,
          pillWidth,
          pillHeight: PILL_H,
          minGap: MIN_GAP,
          leaderMin: LEADER_MIN,
          leaderMax: LEADER_MAX,
          candleRects,
          avgBands,
        })
        layoutMs = performance.now() - tLayout0 // [LADDER-FREQ] temp

        // Freeze the per-pill paint data (measure textW once, with font set above).
        pills = placed.map((p, i) => ({
          kind: p.kind,
          pillX: p.pillX,
          pillY: p.pillY,
          x: p.x,
          y: p.y,
          label: labels[i],
          size: pts[i].size,
          textW: ctx.measureText(labels[i]).width,
        }))
        this.cache_ = { pills, markersRef: markers, paneW, paneH, hr, vr, builtAt: now }

        // [LADDER-FREQ] carry the rebuild-only geometry counts for the probe.
        freqLastBars = bars.length
        freqLastRects = candleRects.length
        freqLastSumRectH = candleRects.reduce((s, rr) => s + rr.h, 0)
        freqLastMaxRectH = candleRects.reduce((m, rr) => Math.max(m, rr.h), 0)
        freqLastMaxRectAbsY = candleRects.reduce((m, rr) => Math.max(m, Math.abs(rr.y)), 0)
      }

      const t1 = performance.now() // [LADDER-FREQ] temp
      const drawMs = t1 - t0

      // [LADDER-FREQ] accumulate; emit ONE aggregate line every FREQ_EVERY draws.
      const range = ts.getVisibleLogicalRange()
      const rFrom = range ? Number(range.from) : NaN
      const rTo = range ? Number(range.to) : NaN
      if (freqLastRange && rFrom === freqLastRange.from && rTo === freqLastRange.to) freqRangeUnchanged++
      freqLastRange = range ? { from: rFrom, to: rTo } : null
      freqDraws++
      if (canReuse) freqReused++
      freqMsSum += drawMs
      freqMsMin = Math.min(freqMsMin, drawMs)
      freqMsMax = Math.max(freqMsMax, drawMs)
      freqLayoutSum += layoutMs
      freqLayoutMin = Math.min(freqLayoutMin, layoutMs)
      freqLayoutMax = Math.max(freqLayoutMax, layoutMs)
      // ---- PAINT (every draw, hit or miss) — reads only from `pills`. The only
      // code between t1 and tPaint0 is the [LADDER-FREQ] accumulate above (a few
      // arithmetic ops), so [tPaint0, t2] is the canvas paint loop alone. ----
      const tPaint0 = performance.now() // [LADDER-FREQ] temp
      for (let i = 0; i < pills.length; i++) {
        const p = pills[i]
        const color = p.kind === 'entry' ? COLOR_ENTRY : COLOR_EXIT

        const pw = p.textW + 2 * PILL_PAD_X * hr
        const ph = PILL_H * vr
        const pillCx = p.pillX * hr
        const pillCy = p.pillY * vr
        const pillLeft = pillCx - pw / 2
        const dotX = p.x * hr
        const dotY = p.y * vr
        // leader reaches the pill's NEAR edge: an entry pill sits LEFT of the dot
        // (its RIGHT edge faces the dot); an exit pill sits RIGHT (its LEFT edge).
        const nearX = p.kind === 'entry' ? pillCx + pw / 2 : pillCx - pw / 2

        ctx.beginPath()
        ctx.strokeStyle = COLOR_LEADER
        ctx.lineWidth = Math.max(1, hr)
        ctx.moveTo(dotX, dotY)
        ctx.lineTo(nearX, pillCy)
        ctx.stroke()

        roundRect(ctx, pillLeft, pillCy - ph / 2, pw, ph, PILL_RADIUS * Math.min(hr, vr))
        ctx.fillStyle = color
        ctx.fill()
        ctx.fillStyle = COLOR_PILL_TEXT
        ctx.textAlign = 'left'
        ctx.fillText(p.label, pillLeft + PILL_PAD_X * hr, pillCy)

        const r = (DOT_BASE_R + p.size) * Math.min(hr, vr)
        ctx.beginPath()
        ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.lineWidth = Math.max(1, Math.min(hr, vr))
        ctx.strokeStyle = COLOR_DOT_RING
        ctx.stroke()
      }
      const t2 = performance.now() // [LADDER-FREQ] temp
      const paintMs = t2 - tPaint0
      freqPaintSum += paintMs
      freqPaintMin = Math.min(freqPaintMin, paintMs)
      freqPaintMax = Math.max(freqPaintMax, paintMs)

      // [LADDER-FREQ] emit AFTER the paint loop so THIS frame's paintMs is included.
      if (freqDraws >= FREQ_EVERY) {
        const windowMs = t1 - freqWindowStart
        const perSec = windowMs > 0 ? (freqDraws / windowMs) * 1000 : 0
        const freqLine =
          `[LADDER-FREQ] draws=${freqDraws} over ${windowMs.toFixed(0)}ms => ${perSec.toFixed(1)}/sec` +
            ` | reused=${freqReused}/${freqDraws}` +
            ` | rangeUnchanged=${freqRangeUnchanged}/${freqDraws}` +
            ` | drawMs min/avg/max=${freqMsMin.toFixed(2)}/${(freqMsSum / freqDraws).toFixed(2)}/${freqMsMax.toFixed(2)}` +
            ` | layoutMs min/avg/max=${freqLayoutMin.toFixed(2)}/${(freqLayoutSum / freqDraws).toFixed(2)}/${freqLayoutMax.toFixed(2)}` +
            ` | paintMs min/avg/max=${freqPaintMin.toFixed(2)}/${(freqPaintSum / freqDraws).toFixed(2)}/${freqPaintMax.toFixed(2)}` +
            ` | bars=${freqLastBars} rects=${freqLastRects} fills=${pills.length}` +
            ` | paneH=${paneH.toFixed(0)} sumRectH=${freqLastSumRectH.toFixed(0)} maxRectH=${freqLastMaxRectH.toFixed(0)} maxAbsY=${freqLastMaxRectAbsY.toFixed(0)}`
        console.log(freqLine)
        window.api.ladderDiag(freqLine) // [LADDER-DIAG] temp — forward to main stdout
        freqDraws = 0
        freqWindowStart = t1
        freqReused = 0
        freqRangeUnchanged = 0
        freqMsSum = 0
        freqMsMin = Infinity
        freqMsMax = 0
        freqLayoutSum = 0
        freqLayoutMin = Infinity
        freqLayoutMax = 0
        freqPaintSum = 0
        freqPaintMin = Infinity
        freqPaintMax = 0
      }
    })
  }
}

class FillLadderPaneView implements IPrimitivePaneView {
  private readonly renderer_: FillLadderRenderer
  constructor(src: FillLadderPrimitive) {
    this.renderer_ = new FillLadderRenderer(src)
  }
  // 'normal' (not 'top'): draw on the MAIN canvas, which the library skips on
  // cursor/mouse-move paints (its `if (type !== Cursor)` gate) — so our draw()
  // runs only on real changes (pan/zoom/price-stretch/data), not the ~180/sec
  // crosshair repaint loop that top-canvas sources ride.
  zOrder(): 'normal' {
    return 'normal'
  }
  renderer(): IPrimitivePaneRenderer {
    return this.renderer_
  }
}

export class FillLadderPrimitive implements ISeriesPrimitive<Time> {
  // Populated in attached(); read by the renderer (same module).
  chart: AttachParam['chart'] | null = null
  series: AttachParam['series'] | null = null
  markers: readonly TradeMarker[] = []

  private requestUpdate_: (() => void) | null = null
  private readonly paneView_ = new FillLadderPaneView(this)

  attached(param: AttachParam): void {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdate_ = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate_ = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView_]
  }

  /** Push new fills + request a redraw. The primitive recomputes pixel coords
   *  every frame, so there's no marker-reassert RAF hack anymore. */
  setMarkers(markers: readonly TradeMarker[]): void {
    this.markers = markers
    console.count('[LADDER-TRIG] primitive.setMarkers→requestUpdate') // temp
    this.requestUpdate_?.()
  }
}

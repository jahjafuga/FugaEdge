// Fill-ladder canvas primitive (v0.2.4 Step 1). A custom lightweight-charts
// ISeriesPrimitive that draws the trade's fills directly on the chart's own
// canvas at zOrder 'top' — so it bakes into the branded screenshot export for
// free (takeScreenshot captures top-layer primitives), exactly like the piece-1
// CMND export. Replaces the old createSeriesMarkers blob dots.
//
// STEP 1a SCOPE — DOTS ONLY: one filled circle per fill at its true
// (bar_x, fill_price_y). Leaders, pills, and de-collision land in later
// increments (1b/1c) on this same primitive; the de-collision brain
// (layoutFillLadder) is intentionally NOT called here yet.
//
// SAFE ON THE PINNED SCALE: draw() does nothing per frame beyond reading
// coordinates and painting — no layout, no allocation in the hot path, no state
// mutation, no scheduling. The Step 0.5 price-scale pin stops the per-frame
// re-render that would otherwise call draw() every frame; this primitive adds no
// repaint loop of its own.
//
// lightweight-charts is imported TYPES-ONLY (erased at build) so this file pulls
// no runtime into ChartTab's eager graph — ChartTab still dynamic-imports the lib.
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { TradeMarker } from '@/core/charts/buildTradeMarkers'
import { fillLabel } from '@/lib/format'

// The canvas target type isn't re-exported by lightweight-charts; derive it from
// the renderer interface so we don't depend on the transitive 'fancy-canvas' pkg.
type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

const COLOR_BUY = '#3fb389'      // win green — buys (B)
const COLOR_SELL = '#e06b6b'     // loss red — sells (S)
const COLOR_DOT_RING = '#0c0f16' // near-bg ring so the dot reads on any candle
const DOT_BASE_R = 2.5           // + marker size (1..4) → ≈ r4 per the spec
const DOT_STROKE_PX = 1.5        // ring width, CSS px

// Leader + pill (v0.2.4 Step 1b). All CSS px (scaled to bitmap px in draw()).
const COLOR_LEADER = 'rgba(255,255,255,0.38)' // thin leader, dot → pill
const COLOR_PILL_TEXT_BUY = '#08231b'  // dark text on the green buy pill
const COLOR_PILL_TEXT_SELL = '#f3f5fa' // white text on the red sell pill
const PILL_W = 64        // FIXED pill width (matches the brain's fixed-width model;
                         // 1c sizes it to the trade's widest label)
const PILL_H = 18        // pill height
const PILL_RADIUS = 4    // pill corner radius
const PILL_FONT_PX = 10  // pill label font size
const LEADER_GAP = 14    // dot → pill near-edge (the leader length at 1b's naive offset)

function toSeconds(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp
}

// Manual rounded-rect path (matches src/lib/chartScreenshot.ts) — no dependence
// on ctx.roundRect availability. Caller sets fillStyle + fill() after.
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

class FillLadderRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly src: FillLadderPrimitive) {}

  draw(target: DrawTarget): void {
    const { chart, series, markers } = this.src
    if (!chart || !series || markers.length === 0) return
    const ts = chart.timeScale()

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hr = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      const minR = Math.min(hr, vr)
      const ringW = DOT_STROKE_PX * minR
      const pillW = PILL_W * hr
      const pillH = PILL_H * vr
      const pillR = PILL_RADIUS * minR
      const leaderW = Math.max(1, minR)
      // Pill label font + centering — set once, used by every fillText below.
      ctx.font = `600 ${PILL_FONT_PX * vr}px JetBrains Mono, ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const m of markers) {
        // Live coords on the (pinned) scale; skip any fill off the visible range.
        const x = ts.timeToCoordinate(toSeconds(m.time))
        const y = series.priceToCoordinate(m.price)
        if (x === null || y === null) continue
        const color = m.side === 'B' ? COLOR_BUY : COLOR_SELL

        // ── 1b NAIVE FIXED LAYOUT — THE 1c SWAP POINT ───────────────────────
        // Pill a fixed gap RIGHT of the dot, at the same y; the leader meets its
        // left edge. De-collision (the fan) is deferred: 1c replaces JUST this
        // block with assembleLadderFrame's computed pill/leader positions (CSS
        // px), leaving the bitmap scaling + drawing below untouched.
        const pillCxCss = x + LEADER_GAP + PILL_W / 2
        const pillCyCss = y
        const leaderEndXCss = x + LEADER_GAP // pill's near (left) edge
        // ── end swap point ──────────────────────────────────────────────────

        const dotX = x * hr
        const dotY = y * vr
        const pillCx = pillCxCss * hr
        const pillCy = pillCyCss * vr

        // Leader: dot → pill's near edge.
        ctx.beginPath()
        ctx.strokeStyle = COLOR_LEADER
        ctx.lineWidth = leaderW
        ctx.moveTo(dotX, dotY)
        ctx.lineTo(leaderEndXCss * hr, pillCy)
        ctx.stroke()

        // Pill: side-colored rounded rect + centered "QTY @ PRICE".
        roundRect(ctx, pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillR)
        ctx.fillStyle = color
        ctx.fill()
        ctx.fillStyle = m.side === 'B' ? COLOR_PILL_TEXT_BUY : COLOR_PILL_TEXT_SELL
        ctx.fillText(fillLabel(m.qty, m.price), pillCx, pillCy)

        // Dot last — crisp over the leader, on the bar at the true price.
        const r = (DOT_BASE_R + m.size) * minR
        ctx.beginPath()
        ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.lineWidth = ringW
        ctx.strokeStyle = COLOR_DOT_RING
        ctx.stroke()
      }
    })
  }
}

class FillLadderPaneView implements IPrimitivePaneView {
  private readonly renderer_: FillLadderRenderer
  constructor(src: FillLadderPrimitive) {
    this.renderer_ = new FillLadderRenderer(src)
  }
  // Above candles/volume — so the dots sit on top AND the screenshot (which
  // captures top-layer primitives) includes them.
  zOrder(): 'top' {
    return 'top'
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

  /** Hand the primitive the fills + request ONE redraw. draw() recomputes each
   *  dot's pixel coords itself, so there's no marker-reassert RAF hack. */
  setMarkers(markers: readonly TradeMarker[]): void {
    this.markers = markers
    this.requestUpdate_?.()
  }
}

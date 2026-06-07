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
import type { IntradayBarLike } from '@/lib/buildOccupancy'
import { assembleLadderFrame } from '@/lib/assembleLadderFrame'

// The canvas target type isn't re-exported by lightweight-charts; derive it from
// the renderer interface so we don't depend on the transitive 'fancy-canvas' pkg.
type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

const COLOR_BUY = '#3fb389'      // win green — buys (B)
const COLOR_SELL = '#e06b6b'     // loss red — sells (S)
const COLOR_DOT_RING = '#0c0f16' // near-bg ring so the dot reads on any candle
const DOT_STROKE_PX = 1.5        // dot ring width, CSS px

// Leader + pill. All CSS px (scaled to bitmap px in draw()).
const LEADER_COLOR_BUY = 'rgba(63, 179, 137, 0.7)'   // buy-green leader at 0.7 alpha (matches the buy pill #3fb389)
const LEADER_COLOR_SELL = 'rgba(224, 107, 107, 0.7)' // sell-red leader at 0.7 alpha (matches the sell pill #e06b6b)
const COLOR_PILL_TEXT_BUY = '#08231b'  // dark text on the green buy pill
const COLOR_PILL_TEXT_SELL = '#f3f5fa' // white text on the red sell pill
const PILL_W = 80        // FIXED pill width (the brain's de-collision reserves this box; sized for 12px font + 11-char labels)
const PILL_H = 22        // pill height (room for the 12px label)
const PILL_RADIUS = 4    // pill corner radius
const PILL_FONT_PX = 12  // pill label font size

// De-collision opts (v0.2.4 Step 1c) fed to assembleLadderFrame — the brain-test
// values; tunable in the live check.
const MIN_GAP = 4         // min vertical gap between two stacked pills (the fan)
const LEADER_MIN = 14     // shortest leader — pill sits this far from the dot when free
const LEADER_MAX = 44     // preferred max travel (was 140); the brain's overflow tier handles
                         // the rare genuinely-crowded column, so this can't hide pills
const BAND_THICKNESS = 6  // avg-entry/exit band thickness the pills dodge

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
    const { chart, series, markers, bars, avgEntry, avgExit } = this.src
    if (!chart || !series || markers.length === 0) return
    const ts = chart.timeScale()
    // Live coordinate converters on the (pinned) scale. toX takes epoch ms (the
    // brain feeds bar.t / marker.time in ms) → the chart's epoch-seconds time.
    const toX = (timeMs: number): number | null => ts.timeToCoordinate(toSeconds(timeMs))
    const toY = (p: number): number | null => series.priceToCoordinate(p)

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

      // De-collision runs HERE (it needs LIVE toX/toY). Safe on the pinned scale:
      // the scale doesn't drift, so the library doesn't re-render at rest → draw()
      // (and this) isn't called per-frame; during a pan/zoom gesture it runs each
      // repaint but the view settles when the gesture ends → bounded, terminating.
      // No scheduling, no subscription — the library calls draw() when IT repaints.
      const frame = assembleLadderFrame(markers, bars, avgEntry, avgExit, toX, toY, {
        paneWidth: scope.mediaSize.width,
        paneHeight: scope.mediaSize.height,
        pillWidth: PILL_W,
        pillHeight: PILL_H,
        minGap: MIN_GAP,
        leaderMin: LEADER_MIN,
        leaderMax: LEADER_MAX,
        bandThickness: BAND_THICKNESS,
      })

      // Paint the brain's frame. The leader/pill/dot drawing is unchanged from 1b
      // — only the positions (now de-collided + flip-aware) and the color source
      // (frame[i].side) come from the frame instead of the fixed inline offset.
      for (let i = 0; i < frame.pills.length; i++) {
        const dot = frame.dots[i]
        const leader = frame.leaders[i]
        const pill = frame.pills[i]
        const buy = pill.side === 'B'
        const color = buy ? COLOR_BUY : COLOR_SELL

        // Leader: dot → pill's near edge (flip-aware, from the brain).
        ctx.beginPath()
        ctx.strokeStyle = buy ? LEADER_COLOR_BUY : LEADER_COLOR_SELL
        ctx.lineWidth = leaderW
        ctx.moveTo(leader.x1 * hr, leader.y1 * vr)
        ctx.lineTo(leader.x2 * hr, leader.y2 * vr)
        ctx.stroke()

        // Pill: side-colored rounded rect + centered "QTY @ PRICE".
        const pillCx = pill.cx * hr
        const pillCy = pill.cy * vr
        roundRect(ctx, pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillR)
        ctx.fillStyle = color
        ctx.fill()
        ctx.fillStyle = buy ? COLOR_PILL_TEXT_BUY : COLOR_PILL_TEXT_SELL
        ctx.fillText(pill.label, pillCx, pillCy)

        // Dot last — crisp over the leader, on the bar at the true price.
        ctx.beginPath()
        ctx.arc(dot.x * hr, dot.y * vr, dot.r * minR, 0, Math.PI * 2)
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
  bars: IntradayBarLike[] = []
  avgEntry: number | null = null
  avgExit: number | null = null

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

  /** Hand the primitive the fills + the day's bars + the avg-entry/exit prices,
   *  and request ONE redraw. draw() runs the de-collision brain against live
   *  coords on each repaint (no reassert RAF hack); the pinned scale keeps that
   *  bounded — it is not called per-frame at rest. */
  setData(
    markers: readonly TradeMarker[],
    bars: IntradayBarLike[],
    avgEntry: number | null,
    avgExit: number | null,
  ): void {
    this.markers = markers
    this.bars = bars
    this.avgEntry = avgEntry
    this.avgExit = avgExit
    this.requestUpdate_?.()
  }
}

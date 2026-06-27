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
import { pillIsVisible } from '@/lib/fillLadderLayout'

/** The three fill-label display modes, cycled by the chart toolbar button.
 *  'dots' = dots only (no pills); 'hover' = dots + reveal the hovered bar's pills;
 *  'all' = every pill always. Per-trade ephemeral — ChartCanvas owns it and
 *  threshold-initializes it; the primitive just renders the mode it is given. */
export type FillLabelMode = 'dots' | 'hover' | 'all'

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
const LEADER_HALO = 'rgba(12, 15, 22, 0.7)' // dark halo behind the colored leader, separates it from candles
const LEADER_HALO_PX = 3                  // halo stroke width, CSS px (wider than the 1px colored leader)
const PILL_OUTLINE = '#0c0f16'            // dark outline around pills, matches the dot stroke
const PILL_OUTLINE_PX = 1                 // pill outline stroke width, CSS px
const PILL_SHADOW = 'rgba(0, 0, 0, 0.7)'  // pill drop shadow — stronger lift for candle overlap
const PILL_SHADOW_BLUR = 6                // shadow blur radius, CSS px
const PILL_SHADOW_OFFSET_Y = 3            // shadow offset down, CSS px
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
    const { chart, series, markers, bars, avgEntry, avgExit, mode, hoveredBarTime } = this.src
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
      const haloW = LEADER_HALO_PX * minR
      const outlineW = Math.max(1, PILL_OUTLINE_PX * minR)
      const shadowBlur = PILL_SHADOW_BLUR * minR
      const shadowOffY = PILL_SHADOW_OFFSET_Y * vr
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

      // Per-pill visibility (v0.2.4 fill-label modes). 'all' -> every pill; 'dots'
      // -> no pills; 'hover' -> only the hovered bar's pill (pillIsVisible). A cheap
      // check over the ALREADY-assembled frame -- no re-layout on mode/hover change.
      // Dots ignore this and always paint. toSeconds aligns the pill's epoch-ms bar
      // time with the crosshair's epoch-seconds hoveredBarTime.
      const pillVisible = frame.pills.map((p) => {
        if (mode === 'all') return true
        if (mode === 'dots') return false
        return pillIsVisible(true, toSeconds(p.time), hoveredBarTime) // 'hover'
      })

      // Paint the brain's frame in z-order: leader halos, colored leaders, then
      // pills (shadowed fill + outline + text), then dots on top. Leaders draw in
      // TWO passes so every dark halo sits behind every colored line. The leader
      // object carries no side, so the colored pass reads it from frame.pills[i]
      // (index-aligned with frame.leaders[i]).

      // Pass 1 — dark halo behind ALL leaders (separates the colored line from candles).
      ctx.strokeStyle = LEADER_HALO
      ctx.lineWidth = haloW
      for (let i = 0; i < frame.leaders.length; i++) {
        if (!pillVisible[i]) continue
        const leader = frame.leaders[i]
        ctx.beginPath()
        ctx.moveTo(leader.x1 * hr, leader.y1 * vr)
        ctx.lineTo(leader.x2 * hr, leader.y2 * vr)
        ctx.stroke()
      }

      // Pass 2 — side-colored leader on top of its halo.
      ctx.lineWidth = leaderW
      for (let i = 0; i < frame.leaders.length; i++) {
        if (!pillVisible[i]) continue
        const leader = frame.leaders[i]
        ctx.strokeStyle = frame.pills[i].side === 'B' ? LEADER_COLOR_BUY : LEADER_COLOR_SELL
        ctx.beginPath()
        ctx.moveTo(leader.x1 * hr, leader.y1 * vr)
        ctx.lineTo(leader.x2 * hr, leader.y2 * vr)
        ctx.stroke()
      }

      // Pills (shadowed fill + dark outline + text), then dots on top.
      for (let i = 0; i < frame.pills.length; i++) {
        const dot = frame.dots[i]
        const pill = frame.pills[i]
        const buy = pill.side === 'B'
        const color = buy ? COLOR_BUY : COLOR_SELL

        // Pill (and its leader, gated above) paints only when visible: always-on
        // in low-fill, hovered-bar-only in high-fill. The DOT always paints below.
        if (pillVisible[i]) {
          const pillCx = pill.cx * hr
          const pillCy = pill.cy * vr

          // Pill body — drop shadow on the FILL only, for lift over candles.
          ctx.shadowColor = PILL_SHADOW
          ctx.shadowBlur = shadowBlur
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = shadowOffY
          roundRect(ctx, pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillR)
          ctx.fillStyle = color
          ctx.fill()

          // Reset the shadow BEFORE the outline/text/dot — only the fill is shadowed.
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0

          // Outline the same rounded-rect path — crisps the edge on any background.
          ctx.strokeStyle = PILL_OUTLINE
          ctx.lineWidth = outlineW
          ctx.stroke()

          // Centered "QTY @ PRICE".
          ctx.fillStyle = buy ? COLOR_PILL_TEXT_BUY : COLOR_PILL_TEXT_SELL
          ctx.fillText(pill.label, pillCx, pillCy)
        }

        // Dot last — crisp over the leader, on the bar at the true price. ALWAYS
        // painted (dots mark every fill in both modes; only pills hover-gate).
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

  // Fill-label display mode (v0.2.4 — high-fill readability, 3-state). Set by
  // ChartCanvas (threshold-initialized per trade, cycled by the toolbar button);
  // the primitive just renders it. 'dots' = no pills; 'hover' = only the hovered
  // bar's pills (hoveredBarTime, fed by ChartTab's crosshair handler); 'all' =
  // every pill. hoveredBarTime is null when the cursor is off the bars.
  mode: FillLabelMode = 'hover'
  hoveredBarTime: number | null = null

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

  /** Set the bar under the crosshair (chart epoch-SECONDS), or null when the
   *  cursor is off the bars, and repaint. NO-OP in low-fill mode (pills are
   *  always-on there, so hover changes nothing) and when the bar is unchanged —
   *  so the continuous crosshair stream only repaints on an actual bar change,
   *  honoring the freeze guard (the de-collision re-runs inside draw()). ChartTab
   *  also gates by bar-change before calling; this guard is belt-and-braces. */
  setHoveredBar(timeSec: number | null): void {
    if (this.mode !== 'hover') return
    if (this.hoveredBarTime === timeSec) return
    this.hoveredBarTime = timeSec
    this.requestUpdate_?.()
  }

  /** Set the fill-label display mode (cycled by the toolbar button), and repaint
   *  on change. 'dots' = no pills, 'hover' = hovered bar only, 'all' = every pill. */
  setMode(mode: FillLabelMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this.requestUpdate_?.()
  }
}

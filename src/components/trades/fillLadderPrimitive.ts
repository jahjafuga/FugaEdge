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

// The canvas target type isn't re-exported by lightweight-charts; derive it from
// the renderer interface so we don't depend on the transitive 'fancy-canvas' pkg.
type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

const COLOR_BUY = '#3fb389'      // win green — buys (B)
const COLOR_SELL = '#e06b6b'     // loss red — sells (S)
const COLOR_DOT_RING = '#0c0f16' // near-bg ring so the dot reads on any candle
const DOT_BASE_R = 2.5           // + marker size (1..4) → ≈ r4 per the spec
const DOT_STROKE_PX = 1.5        // ring width, CSS px

function toSeconds(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp
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
      const ringW = DOT_STROKE_PX * Math.min(hr, vr)

      for (const m of markers) {
        // Live coords on the (pinned) scale; skip any fill off the visible range.
        const x = ts.timeToCoordinate(toSeconds(m.time))
        const y = series.priceToCoordinate(m.price)
        if (x === null || y === null) continue

        const r = (DOT_BASE_R + m.size) * Math.min(hr, vr)
        ctx.beginPath()
        ctx.arc(x * hr, y * vr, r, 0, Math.PI * 2)
        ctx.fillStyle = m.side === 'B' ? COLOR_BUY : COLOR_SELL
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

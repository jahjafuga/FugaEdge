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
import { layoutFillLadder } from '@/lib/fillLadderLayout'
import { int, price } from '@/lib/format'

// The canvas target type isn't re-exported by lightweight-charts; derive it from
// the renderer interface so we don't depend on the transitive 'fancy-canvas' pkg.
type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

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
const PILL_OFFSET_X = 56 // dot → pill-center; > half a typical pill so it clears the dot
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

      // Live CSS-px coords for each fill; drop any off the visible range.
      const pts: { x: number; y: number; qty: number; price: number; kind: 'entry' | 'exit'; side: 'B' | 'S'; size: number }[] = []
      for (const m of markers) {
        const x = ts.timeToCoordinate(toSeconds(m.time))
        const y = series.priceToCoordinate(m.price)
        if (x === null || y === null) continue
        pts.push({ x, y, qty: m.qty, price: m.price, kind: m.kind, side: m.side, size: m.size })
      }
      if (pts.length === 0) return

      // Pure de-collision (CSS px). placed[i] ↔ pts[i] (input order preserved).
      const placed = layoutFillLadder(pts, {
        paneHeight: scope.mediaSize.height,
        pillHeight: PILL_H,
        minGap: MIN_GAP,
        pillOffsetX: PILL_OFFSET_X,
      })

      ctx.font = `600 ${PILL_FONT_PX * vr}px JetBrains Mono, ui-monospace, monospace`
      ctx.textBaseline = 'middle'

      for (let i = 0; i < placed.length; i++) {
        const p = placed[i]
        const color = p.kind === 'entry' ? COLOR_ENTRY : COLOR_EXIT
        const label = `${int(p.qty)} @ ${price(p.price)}`

        const textW = ctx.measureText(label).width // bitmap px
        const pillW = textW + 2 * PILL_PAD_X * hr
        const pillH = PILL_H * vr
        const pillCx = p.pillX * hr
        const pillCy = p.pillY * vr
        const pillLeft = pillCx - pillW / 2
        const dotX = p.x * hr
        const dotY = p.y * vr

        // leader: dot → pill left-center
        ctx.beginPath()
        ctx.strokeStyle = COLOR_LEADER
        ctx.lineWidth = Math.max(1, hr)
        ctx.moveTo(dotX, dotY)
        ctx.lineTo(pillLeft, pillCy)
        ctx.stroke()

        // pill
        roundRect(ctx, pillLeft, pillCy - pillH / 2, pillW, pillH, PILL_RADIUS * Math.min(hr, vr))
        ctx.fillStyle = color
        ctx.fill()
        ctx.fillStyle = COLOR_PILL_TEXT
        ctx.textAlign = 'left'
        ctx.fillText(label, pillLeft + PILL_PAD_X * hr, pillCy)

        // dot last, so it sits crisp over the leader, on the bar at the true price
        const r = (DOT_BASE_R + pts[i].size) * Math.min(hr, vr)
        ctx.beginPath()
        ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.lineWidth = Math.max(1, Math.min(hr, vr))
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
  // Draw above the candles/volume.
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

  /** Push new fills + request a redraw. The primitive recomputes pixel coords
   *  every frame, so there's no marker-reassert RAF hack anymore. */
  setMarkers(markers: readonly TradeMarker[]): void {
    this.markers = markers
    this.requestUpdate_?.()
  }
}

// No-op "signal" primitive: a lightweight-charts ISeriesPrimitive that draws
// NOTHING — its sole job is to fire onRepaint() on every repaint (including
// price-axis stretch), so a DOM/SVG overlay can reposition itself. The freeze in
// the old canvas primitive was the per-frame canvas DRAW on the GPU present path;
// this keeps the repaint TRIGGER (library-driven) and removes the draw entirely.
// The overlay does the actual rendering as positioned SVG (compositor path).
//
// lightweight-charts imported types-only (erased at build).
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]
type AttachParam = SeriesAttachedParameter<Time>

class SignalRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly src: FillLadderSignalPrimitive) {}
  draw(_target: DrawTarget): void {
    // Notify the overlay a repaint happened; draw nothing on the canvas.
    this.src.onRepaint?.()
  }
}

class SignalPaneView implements IPrimitivePaneView {
  private readonly renderer_: SignalRenderer
  constructor(src: FillLadderSignalPrimitive) {
    this.renderer_ = new SignalRenderer(src)
  }
  zOrder(): 'top' {
    return 'top'
  }
  renderer(): IPrimitivePaneRenderer {
    return this.renderer_
  }
}

export class FillLadderSignalPrimitive implements ISeriesPrimitive<Time> {
  /** Fired on every repaint. The host sets this to its reposition handler. */
  onRepaint: (() => void) | null = null

  private requestUpdate_: (() => void) | null = null
  private readonly paneView_ = new SignalPaneView(this)

  attached(param: AttachParam): void {
    this.requestUpdate_ = param.requestUpdate
  }

  detached(): void {
    this.requestUpdate_ = null
    this.onRepaint = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView_]
  }

  /** Ask the library to repaint (e.g. after markers/bars change) — which will in
   *  turn fire onRepaint via the renderer. */
  requestRepaint(): void {
    this.requestUpdate_?.()
  }
}

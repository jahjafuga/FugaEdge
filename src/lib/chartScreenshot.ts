// Pure branded-screenshot compositor. Takes a chart canvas already captured by
// lightweight-charts and paints a FugaEdge-branded header + 5-cell footer around
// it, returning a new canvas ready for toBlob(). No React, no Electron, no IPC —
// just canvas drawing + the bundled icon asset. ChartTab orchestrates (capture →
// format strings via @/lib/format → call this → blob → save).
import iconUrl from '@/assets/fugaedge-icon-light.png'
import { chartColors } from '@/lib/chartColors'
import type { ResolvedTheme } from '@/lib/theme'

export interface BrandedScreenshotData {
  symbol: string
  side: 'long' | 'short'
  /** Playbook/setup name, or null to omit the chip entirely. */
  setupName: string | null
  /** Pre-formatted date label (e.g. "Jun 4, 2026"). */
  dateLabel: string
  /** Raw net P&L — the ONLY non-string field; used to pick the win/loss color. */
  netPnl: number
  netPnlText: string
  avgEntryText: string
  avgExitText: string
  sharesText: string
  holdText: string
}

// Strip colors are THEME-AWARE — derived per call from chartColors(theme) inside
// composeBrandedScreenshot (below) so the frame is seamless with the captured
// chart in both light and dark. Only the font is theme-independent here.
const FONT = 'JetBrains Mono, ui-monospace, monospace'

// Icon decode is cached across calls — the asset never changes, so resolve the
// <img> once and reuse it for every screenshot.
let iconPromise: Promise<HTMLImageElement> | null = null
function loadIcon(): Promise<HTMLImageElement> {
  if (!iconPromise) {
    iconPromise = (async () => {
      const img = new Image()
      img.src = iconUrl
      await img.decode()
      return img
    })()
  }
  return iconPromise
}

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

export async function composeBrandedScreenshot(
  chartCanvas: HTMLCanvasElement,
  data: BrandedScreenshotData,
  theme: ResolvedTheme,
): Promise<HTMLCanvasElement> {
  // SCALE: the captured canvas is ALREADY device-pixel sized — lightweight-
  // charts renders at devicePixelRatio, so chartCanvas.width/height are physical
  // pixels (a 700-CSS-px chart is 1400px wide on a 2x display). We never read
  // devicePixelRatio; instead we treat those physical dims as ground truth and
  // derive every branding size from `unit = chartCanvas.width / 1000`. So the
  // header is always 6.4% of the width tall, fonts scale with it, and the frame
  // is exactly as crisp as the chart at any DPR.
  const W = chartCanvas.width
  const unit = W / 1000
  const px = (n: number): number => Math.round(n * unit)

  // Strip palette, themed to the captured chart (seamless in light + dark). Local
  // names mirror the former module consts so the drawing code below is unchanged.
  const palette = chartColors(theme)
  const BG = palette.background      // strip + seam bg (matches the chart pane)
  const GOLD = palette.sideA         // wordmark + setup chip (the themed gold pair)
  const WHITE = palette.fgPrimary    // symbol + footer values (primary text)
  const WIN = palette.win            // long pill + positive net P&L
  const LOSS = palette.loss          // short pill + negative net P&L
  const MUTED = palette.axis         // labels + date
  const DIVIDER = palette.grid       // dividers + borders

  const headerH = px(64)
  const footerH = px(96)
  const H = headerH + chartCanvas.height + footerH
  const pad = px(20)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for screenshot composite')

  // Canvas text uses fonts loaded in the document. JetBrains Mono is the app font
  // (already rendering in the chart), but await fonts.ready so a cold first
  // screenshot can't fall back to a default mono. (Smoke-test: confirm the text
  // is JetBrains Mono, not a system mono.)
  if (document.fonts?.ready) await document.fonts.ready

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'

  // ── Header ────────────────────────────────────────────────────────────────
  const midY = Math.round(headerH / 2)
  const icon = await loadIcon()
  const iconSize = px(32)
  ctx.drawImage(icon, pad, Math.round((headerH - iconSize) / 2), iconSize, iconSize)

  let x = pad + iconSize + px(10)
  ctx.textAlign = 'left'

  ctx.font = `600 ${px(20)}px ${FONT}`
  ctx.fillStyle = GOLD
  ctx.fillText('FUGAEDGE', x, midY)
  x += ctx.measureText('FUGAEDGE').width + px(16)

  ctx.strokeStyle = DIVIDER
  ctx.lineWidth = Math.max(1, px(1))
  ctx.beginPath()
  ctx.moveTo(x, px(16))
  ctx.lineTo(x, headerH - px(16))
  ctx.stroke()
  x += px(16)

  ctx.font = `600 ${px(22)}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText(data.symbol, x, midY)
  x += ctx.measureText(data.symbol).width + px(12)

  // side pill — tinted bg + solid text
  const pillColor = data.side === 'short' ? LOSS : WIN
  const pillText = data.side.toUpperCase()
  ctx.font = `600 ${px(12)}px ${FONT}`
  const pillH = px(20)
  const pillW = ctx.measureText(pillText).width + px(8) * 2
  ctx.fillStyle = pillColor + '22' // ~13% alpha tint
  roundRect(ctx, x, Math.round((headerH - pillH) / 2), pillW, pillH, px(4))
  ctx.fill()
  ctx.fillStyle = pillColor
  ctx.textAlign = 'center'
  ctx.fillText(pillText, x + pillW / 2, midY)
  ctx.textAlign = 'left'
  x += pillW + px(12)

  // setup chip (optional — omitted when null)
  if (data.setupName) {
    ctx.font = `500 ${px(13)}px ${FONT}`
    ctx.fillStyle = GOLD
    ctx.fillText(data.setupName, x, midY)
  }

  // date — right-aligned
  ctx.font = `500 ${px(13)}px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(data.dateLabel, W - pad, midY)
  ctx.textAlign = 'left'

  // ── Chart ─────────────────────────────────────────────────────────────────
  ctx.drawImage(chartCanvas, 0, headerH)

  // ── Footer — 5 cells with thin dividers + a top border ──────────────────────
  const footerY = headerH + chartCanvas.height
  ctx.strokeStyle = DIVIDER
  ctx.lineWidth = Math.max(1, px(1))
  ctx.beginPath()
  ctx.moveTo(0, footerY + 0.5)
  ctx.lineTo(W, footerY + 0.5)
  ctx.stroke()

  const cells: { label: string; value: string; color: string }[] = [
    { label: 'Net P&L', value: data.netPnlText, color: data.netPnl >= 0 ? WIN : LOSS },
    { label: 'Avg Entry', value: data.avgEntryText, color: WHITE },
    { label: 'Avg Exit', value: data.avgExitText, color: WHITE },
    { label: 'Shares', value: data.sharesText, color: WHITE },
    { label: 'Hold', value: data.holdText, color: WHITE },
  ]
  const cellW = W / cells.length
  const labelY = footerY + Math.round(footerH * 0.36)
  const valueY = footerY + Math.round(footerH * 0.64)
  cells.forEach((cell, i) => {
    const cellX = Math.round(i * cellW) + pad
    if (i > 0) {
      const dx = Math.round(i * cellW) + 0.5
      ctx.strokeStyle = DIVIDER
      ctx.beginPath()
      ctx.moveTo(dx, footerY + px(18))
      ctx.lineTo(dx, footerY + footerH - px(18))
      ctx.stroke()
    }
    ctx.font = `600 ${px(10)}px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(cell.label.toUpperCase(), cellX, labelY)
    ctx.font = `600 ${px(16)}px ${FONT}`
    ctx.fillStyle = cell.color
    ctx.fillText(cell.value, cellX, valueY)
  })

  return canvas
}
